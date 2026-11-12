import { describe, expect, it } from 'vitest';
import { FILMS, nextVariant, pickVariant } from '../src/data/catalog';

describe('Stall fallback: the next copy of a film', () => {
  const bbb = FILMS.find((f) => f.id === 'big-buck-bunny')!;
  const tos = FILMS.find((f) => f.id === 'tears-of-steel')!;

  it('tries another host first, since a stalling host usually stalls on every file', () => {
    const at480 = pickVariant(bbb, 'commons', '480p');
    expect(nextVariant(bbb, at480, new Set([at480.src]))!.server).toBe('archive');
  });

  it('then the other qualities on the same host: sharper, then lighter', () => {
    const at480 = pickVariant(tos, 'commons', '480p');
    const first = nextVariant(tos, at480, new Set([at480.src]))!;
    expect(first.quality).toBe('1080p');
    expect(nextVariant(tos, first, new Set([at480.src, first.src]))!.quality).toBe('240p');
  });

  it('stops when every copy has been given up on', () => {
    const all = new Set(bbb.variants.map((v) => v.src));
    expect(nextVariant(bbb, bbb.variants[0]!, all)).toBeNull();
  });
});

import { isStalled } from '../src/pages/stall';
const el = (readyState: number, ahead: number | null, currentTime = 5) =>
  ({ readyState, currentTime, buffered: ahead === null ? { length: 0, end: () => 0 } : { length: 1, end: () => currentTime + ahead } }) as unknown as HTMLVideoElement;

describe('Stall rule', () => {
  it('gives up after 3 s on a copy that claims data but has nothing buffered ahead', () => {
    expect(isStalled(2000, el(4, null))).toBe(false);
    expect(isStalled(3000, el(4, null))).toBe(true);
    expect(isStalled(3000, el(4, 0))).toBe(true);
  });
  it('gives a copy that is still loading, or has data ahead, 10 s', () => {
    expect(isStalled(5000, el(1, null))).toBe(false);
    expect(isStalled(5000, el(4, 12))).toBe(false);
    expect(isStalled(10000, el(1, null))).toBe(true);
  });
});
