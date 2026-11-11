/** Formats seconds as H:MM:SS or M:SS. Non-finite or negative input becomes 0:00. */
export function formatTime(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** Spoken form for aria-valuetext / labels, e.g. "1 minute 5 seconds". */
export function speakTime(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  if (sec || parts.length === 0) parts.push(`${sec} ${sec === 1 ? 'second' : 'seconds'}`);
  return parts.join(' ');
}

/** Parses "90", "1:30" or "1:02:03" (also with decimals) into seconds; null when invalid. */
export function parseTimeInput(text: string): number | null {
  const parts = text.trim().split(':');
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
