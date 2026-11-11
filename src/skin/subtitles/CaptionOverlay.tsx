import { usePlayer } from '@videojs/react/video';
import type { CSSProperties } from 'react';
import { activeText } from './parse';
import { useSubtitles, type CaptionStyle } from './SubtitleContext';

const SIZES: Record<CaptionStyle['size'], string> = { sm: '0.85rem', md: '1.1rem', lg: '1.5rem', xl: '2rem' };

export function captionCssVars(style: CaptionStyle): CSSProperties {
  const outline =
    style.outline === 'outline'
      ? '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 0 4px #000'
      : style.outline === 'shadow'
        ? '0 2px 4px rgb(0 0 0 / 0.9), 0 0 8px rgb(0 0 0 / 0.7)'
        : 'none';
  return {
    ['--cap-size' as string]: SIZES[style.size],
    ['--cap-color' as string]: style.color,
    ['--cap-bg' as string]: `rgb(5 7 12 / ${style.bgOpacity / 100})`,
    ['--cap-shadow' as string]: outline,
  };
}

/** Draws the active subtitle line. The selector returns a string, so it re-renders only when the text changes. */
export function CaptionOverlay() {
  const { active, offset, style } = useSubtitles();
  const cues = active?.cues;
  const text = usePlayer((s) => (cues ? activeText(cues, s.currentTime - offset) : ''));
  if (!text) return null;
  return (
    <div className="cs-captions" data-position={style.position} style={captionCssVars(style)} aria-hidden="true">
      <span className="cs-caption-text">{text}</span>
    </div>
  );
}
