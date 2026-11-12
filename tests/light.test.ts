import { describe, expect, it } from 'vitest';
import { aperture, evText, isCut, kelvinText, readPixels, scalePos, warmth } from '../src/skin/frame/light';

/** A 48×27 RGBA frame filled with one colour, optionally with black letterbox rows top and bottom. */
function frame(rgb: [number, number, number], bars = 0, other?: { rgb: [number, number, number]; share: number }) {
  const W = 48;
  const H = 27;
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const bar = y < bars || y >= H - bars;
      const c = bar ? [0, 0, 0] : other && x < W * other.share ? other.rgb : rgb;
      d.set([c[0]!, c[1]!, c[2]!, 255], i);
    }
  return d;
}

describe('Lightmeter readings', () => {
  it('reads middle grey as 0 EV and a frame one stop brighter as about +1 EV', () => {
    // sRGB 118 is ~18% linear luminance: middle grey.
    expect(readPixels(frame([118, 118, 118]), 48)!.ev).toBeCloseTo(0, 1);
    // sRGB 160 is ~35% linear: about one stop above.
    expect(readPixels(frame([160, 160, 160]), 48)!.ev).toBeCloseTo(0.98, 1);
  });

  it('ignores letterbox bars instead of reading them as shadow', () => {
    const plain = readPixels(frame([118, 118, 118]), 48)!;
    const boxed = readPixels(frame([118, 118, 118], 5), 48)!;
    expect(boxed.ev).toBeCloseTo(plain.ev, 5);
  });

  it('tells a warm frame from a cool one', () => {
    const lamp = readPixels(frame([200, 140, 90]), 48)!;
    const street = readPixels(frame([110, 140, 190]), 48)!;
    expect(warmth(lamp.kelvin)).toBe('Warm');
    expect(warmth(street.kelvin)).toBe('Cool');
    expect(lamp.kelvin).toBeLessThan(street.kelvin);
  });

  it('places each tone where its brightness falls, darkest first, and finds the key light', () => {
    const r = readPixels(frame([30, 30, 34], 0, { rgb: [230, 120, 60], share: 0.4 }), 48)!;
    expect(r.tones.length).toBe(2);
    expect(r.tones[0]!.ev).toBeLessThan(r.tones[1]!.ev);
    // The key light is the saturated orange, lifted: red stays dominant.
    const [red, , blue] = [1, 3, 5].map((i) => parseInt(r.light.slice(i, i + 2), 16));
    expect(red!).toBeGreaterThan(blue!);
  });

  it('returns nothing for an empty or all-black frame', () => {
    expect(readPixels(new Uint8ClampedArray(0), 48)).toBeNull();
    expect(readPixels(frame([0, 0, 0]), 48)).toBeNull();
  });

  it('calls a cut on a real change of light, not on a flicker', () => {
    const a = readPixels(frame([118, 118, 118]), 48)!;
    const flicker = readPixels(frame([124, 120, 118]), 48)!;
    const darker = readPixels(frame([60, 60, 60]), 48)!;
    const blue = readPixels(frame([90, 120, 200]), 48)!;
    expect(isCut(a, flicker)).toBe(false);
    expect(isCut(a, darker)).toBe(true);
    expect(isCut(a, blue)).toBe(true);
  });

  it('reads out honestly: signed stops, and colour temperature only where the formula holds', () => {
    expect(evText(-1.73)).toBe('−1.7 EV');
    expect(evText(0.04)).toBe('0.0 EV');
    expect(evText(1.26)).toBe('+1.3 EV');
    expect(kelvinText(4049)).toBe('4000 K');
    expect(kelvinText(13400)).toBe('12000+ K');
    expect(kelvinText(1500)).toBe('2000− K');
  });

  it('maps the scale from −3 to +3 stops, and opens the iris in the dark', () => {
    expect(scalePos(-5)).toBe(0);
    expect(scalePos(0)).toBe(0.5);
    expect(scalePos(9)).toBe(1);
    expect(aperture(-3)).toBe(1);
    expect(aperture(1)).toBeCloseTo(0.35, 5);
    expect(aperture(-1)).toBeGreaterThan(aperture(0));
  });
});
