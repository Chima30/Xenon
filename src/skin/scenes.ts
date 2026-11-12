/**
 * Scenes as the skin understands them. A host passes either authored chapters (real titles, optional
 * descriptions) or plainly labelled timed sections. The skin never invents scene names or descriptions:
 * it only displays what the host supplies, and hides scene features when nothing is supplied.
 */
export interface SkinScene {
  start: number;
  end: number;
  title: string;
  /** Written by a person (a chapter synopsis). Shown as Scene Insight only when present. */
  description?: string;
  /** True for authored chapters, false for generated equal sections. */
  authored?: boolean;
}

/** Index of the scene containing `time`, or -1 before the first scene / when there are none. */
export function sceneIndexAt(scenes: readonly SkinScene[], time: number): number {
  for (let i = scenes.length - 1; i >= 0; i--) {
    const s = scenes[i];
    if (s && time >= s.start) return i;
  }
  return -1;
}

/** "Chapter" or "Section", so labels stay honest about where scene data came from. */
export const sceneKind = (scenes: readonly SkinScene[]) => (scenes.some((s) => s.authored) ? 'Chapter' : 'Section');
