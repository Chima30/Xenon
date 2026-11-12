import { describe, expect, it } from 'vitest';
import { settle, type Area } from '../src/skin/slate/movable';

// A 1280×720 picture: top bar ends at 74, dock starts at 650, the pod sits in the middle.
const area: Area = { stageH: 720, minLeft: 8, maxLeft: 1280 - 440 - 8, minTop: 82, maxTop: 642 - 120, pod: { left: 546, top: 324, width: 188, height: 64 } };
const size = { width: 440, height: 120 };
const overlaps = (p: { left: number; top: number }) => {
  const q = area.pod!;
  return p.left < q.left + q.width && p.left + size.width > q.left && p.top < q.top + q.height && p.top + size.height > q.top;
};

describe('Movable pause slate: where it may go', () => {
  it('stays where it is put when that is clear', () => {
    expect(settle({ left: 40, top: 120 }, size, area)).toEqual({ left: 40, top: 120 });
  });

  it('never goes under the top bar, the dock or past the edges', () => {
    expect(settle({ left: -200, top: -50 }, size, area)).toEqual({ left: 8, top: 82 });
    expect(settle({ left: 5000, top: 5000 }, size, area)).toEqual({ left: 832, top: 522 });
  });

  it('slides off the Playback Pod to the nearest clear place', () => {
    const dropped = { left: 420, top: 300 };
    const at = settle(dropped, size, area);
    expect(overlaps(at)).toBe(false);
    expect(at.top).toBeGreaterThanOrEqual(area.minTop);
    expect(at.top).toBeLessThanOrEqual(area.maxTop);
  });

  it('works without a pod (the pod lives in the dock in Compact and Expanded)', () => {
    expect(settle({ left: 420, top: 300 }, size, { ...area, pod: null })).toEqual({ left: 420, top: 300 });
  });
});
