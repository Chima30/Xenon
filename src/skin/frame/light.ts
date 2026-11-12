/**
 * XENON Lightmeter: what the frame on screen measures. Pure functions over pixels, so they can be tested.
 *
 *   ev      the frame's key, as a reflected-light meter reads it: the geometric mean of luminance relative to
 *           middle grey (18%), in stops. Letterbox rows are ignored.
 *   kelvin  the correlated colour temperature of the frame's average colour (McCamy's approximation, which holds
 *           from about 2000 K to 12,000 K; outside that the reading says so rather than inventing precision).
 *   tones   up to six distinct tones of the frame, each placed where its own brightness falls on the scale.
 *   light   the frame's key light: the most saturated of its brighter tones, lifted to read as light.
 */
export interface LightReading {
  ev: number;
  kelvin: number;
  tones: { colour: string; ev: number }[];
  light: string;
}

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luma = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const MID_GREY = Math.log2(0.18);
const hex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** Reads RGBA pixels of a `width`-wide frame. Null when there is nothing to read. */
export function readPixels(data: ArrayLike<number>, width: number): LightReading | null {
  const rows = Math.floor(data.length / 4 / width);
  let n = 0;
  let logY = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let y = 0; y < rows; y++) {
    // A letterbox bar is a row with no light in it at all.
    let rowMax = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rowMax = Math.max(rowMax, data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    }
    if (rowMax < 12) continue;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      logY += Math.log2(luma(r, g, b) + 1e-4);
      sr += lin(r);
      sg += lin(g);
      sb += lin(b);
      n++;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const cell = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      cell.n++;
      cell.r += r;
      cell.g += g;
      cell.b += b;
      buckets.set(key, cell);
    }
  }
  if (n === 0) return null;
  const ev = logY / n - MID_GREY;

  const [R, G, B] = [sr / n, sg / n, sb / n];
  const X = 0.4124 * R + 0.3576 * G + 0.1805 * B;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = 0.0193 * R + 0.1192 * G + 0.9505 * B;
  const sum = X + Y + Z || 1;
  const cx = X / sum;
  const cy = Y / sum;
  const m = (cx - 0.332) / (0.1858 - cy);
  const kelvin = 449 * m ** 3 + 3525 * m ** 2 + 6823.3 * m + 5520.33;

  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n).map((c) => [c.r / c.n, c.g / c.n, c.b / c.n]);
  const picked: number[][] = [];
  for (const c of ranked) {
    if (picked.every((p) => Math.hypot(p[0]! - c[0]!, p[1]! - c[1]!, p[2]! - c[2]!) > 40)) picked.push(c);
    if (picked.length === 6) break;
  }
  const tones = picked
    .map((c) => ({ c, ev: Math.log2(luma(c[0]!, c[1]!, c[2]!) + 1e-4) - MID_GREY }))
    .sort((a, b) => a.ev - b.ev);
  const sat = (c: number[]) => {
    const mx = Math.max(...c);
    return mx === 0 ? 0 : (mx - Math.min(...c)) / mx;
  };
  const bright = tones.slice(Math.floor(tones.length / 3));
  const key = (bright.length ? bright : tones).reduce((a, b) => (sat(b.c) * (b.ev + 6) > sat(a.c) * (a.ev + 6) ? b : a)).c;
  const top = Math.max(...key, 1);
  const lifted = key.map((v) => (v / top) * 255 * 0.78 + 255 * 0.22);

  return {
    ev,
    kelvin: Number.isFinite(kelvin) ? kelvin : 6500,
    tones: tones.map((t) => ({ colour: hex(t.c), ev: t.ev })),
    light: hex(lifted),
  };
}

const W = 48;
const H = 27;
/** Reads the frame a <video> is showing. Null when its pixels cannot be read (no CORS) or it has no picture yet. */
export function readFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): LightReading | null {
  if (video.readyState < 2 || !video.videoWidth) return null;
  try {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, W, H);
    return readPixels(ctx.getImageData(0, 0, W, H).data, W);
  } catch {
    return null; // a tainted canvas: the host does not allow this video's pixels to be read
  }
}

/** A cut: the light changed enough that a viewer would see a new shot. */
export function isCut(a: LightReading, b: LightReading): boolean {
  const kRatio = Math.abs(Math.log(Math.max(1000, b.kelvin) / Math.max(1000, a.kelvin)));
  const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [p, q] = [hexRgb(a.light), hexRgb(b.light)];
  return Math.abs(b.ev - a.ev) >= 0.7 || kRatio >= 0.22 || Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!) > 70;
}

export const warmth = (k: number) => (k < 4500 ? 'Warm' : k > 6500 ? 'Cool' : 'Neutral');
export const kelvinText = (k: number) => (k >= 12000 ? '12000+ K' : k <= 2000 ? '2000− K' : `${Math.round(k / 100) * 100} K`);
export const evText = (ev: number) => {
  const v = Math.round(ev * 10) / 10;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} EV`;
};
/** The scale runs from −3 to +3 stops. */
export const scalePos = (ev: number) => (Math.max(-3, Math.min(3, ev)) + 3) / 6;
/** The lens iris: wide open in a dark frame, stopped down in a bright one (1 … 0.35). */
export const aperture = (ev: number) => 1 - 0.65 * Math.max(0, Math.min(1, (ev + 3) / 4));
