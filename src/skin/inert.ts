import { version } from 'react';

const BOOLEAN_INERT = Number.parseInt(version, 10) >= 19;

/**
 * `inert` as a prop that behaves the same on React 18 and 19. React 19 treats `inert` as a boolean attribute. React 18
 * does not know it: it drops `true` (so a hidden panel stayed reachable by keyboard) and only writes it from a string.
 * Giving React 19 the boolean and React 18 '' (present) or undefined (absent) yields the same DOM on both, so the skin
 * can be dropped into a React 18 site (a Next.js 14 app, say) without losing focus safety.
 */
export function inertProps(on: boolean): { inert?: boolean } {
  return BOOLEAN_INERT ? { inert: on } : ({ inert: on ? '' : undefined } as unknown as { inert?: boolean });
}
