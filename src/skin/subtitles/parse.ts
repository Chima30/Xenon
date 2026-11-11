export interface Cue {
  start: number;
  end: number;
  text: string;
}

const TIME = /(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function toSeconds(match: RegExpMatchArray): number {
  const [, h, m, s, ms] = match;
  return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number((ms ?? '0').padEnd(3, '0')) / 1000;
}

/** Strips WebVTT/SRT markup: <i>, <c.class>, <00:01.000> timestamps, {\an8} style overrides. */
function cleanText(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export class SubtitleParseError extends Error {}

/**
 * Parses SRT or WebVTT text in the browser. Tolerant of BOMs, CRLF, missing cue numbers and
 * NOTE/STYLE/REGION blocks. Throws SubtitleParseError when no usable cue is found.
 */
export function parseSubtitles(input: string): Cue[] {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new SubtitleParseError('The subtitle text is empty.');

  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n');
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0] ?? '')) continue;
    const timingIndex = lines.findIndex((l) => l.includes('-->'));
    if (timingIndex === -1) continue;
    const [a = '', b = ''] = (lines[timingIndex] ?? '').split('-->');
    const start = a.match(TIME);
    const end = b.trim().match(TIME);
    if (!start || !end) continue;
    const s = toSeconds(start);
    const e = toSeconds(end);
    const body = cleanText(lines.slice(timingIndex + 1));
    if (!body || !(e > s)) continue;
    cues.push({ start: s, end: e, text: body });
  }

  if (cues.length === 0) {
    throw new SubtitleParseError('No cues found. Expected SRT or WebVTT with lines like "00:00:01,000 --> 00:00:03,000".');
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** Text of every cue active at `time` (seconds), joined by newlines. */
export function activeText(cues: readonly Cue[], time: number): string {
  let out = '';
  for (const c of cues) {
    if (c.start > time) break; // cues are sorted by start
    if (time < c.end) out += (out ? '\n' : '') + c.text;
  }
  return out;
}

/** Index of the last cue that started at or before `time`, or -1. */
export function cueIndexAt(cues: readonly Cue[], time: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((cues[mid]?.start ?? Infinity) <= time) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/* ---------- Language helpers ---------- */

/** "fr" -> "French" in the viewer's language, falling back to the code itself. */
export function languageName(code: string | undefined): string | null {
  if (!code) return null;
  try {
    const dn = new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Flag emoji, only when the code carries a region (pt-BR, en-GB). Languages are not countries, so "en" alone gets none. */
export function flagFor(code: string | undefined): string | null {
  const region = code?.split(/[-_]/)[1]?.toUpperCase();
  if (!region || !/^[A-Z]{2}$/.test(region)) return null;
  return String.fromCodePoint(...[...region].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
