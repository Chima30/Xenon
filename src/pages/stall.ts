/**
 * When to give up on a copy of a film that should be playing. `stillMs` is how long its clock has not moved.
 * A copy that says it has data (readyState 2+) but has nothing buffered ahead is stuck after 3 s; anything else
 * (still loading, a redirect, a slow first byte) gets 10 s before the next copy is tried.
 */
export function isStalled(stillMs: number, el: Pick<HTMLVideoElement, 'readyState' | 'buffered' | 'currentTime'>): boolean {
  const ahead = el.buffered.length ? el.buffered.end(el.buffered.length - 1) - el.currentTime : 0;
  const claimsData = el.readyState >= 2;
  return stillMs >= 10000 || (stillMs >= 3000 && claimsData && ahead <= 0.1);
}
