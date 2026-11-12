import { useState } from 'react';
import { ModalDialog } from './ModalDialog';

export interface Shortcut {
  keys: string[];
  action: string;
}
export interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

/** The single source of truth for bindings: the skin registers exactly these, the dialog lists exactly these. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Playback',
    items: [
      { keys: ['Space', 'K'], action: 'Play or pause' },
      { keys: ['←', 'J'], action: 'Back 10 seconds' },
      { keys: ['→', 'L'], action: 'Forward 10 seconds' },
      { keys: ['F'], action: 'Fullscreen' },
      { keys: ['I'], action: 'Picture-in-picture (when supported)' },
    ],
  },
  {
    title: 'Sound and captions',
    items: [
      { keys: ['M'], action: 'Mute or unmute' },
      { keys: ['↑', '↓'], action: 'Volume up or down' },
      { keys: ['C'], action: 'Captions on or off (when a track exists)' },
    ],
  },
  {
    title: 'Navigation wheel',
    items: [
      { keys: ['W'], action: 'Open or close the wheel (from Watch mode); focus it in Explore' },
      { keys: ['↑', '↓', '←', '→'], action: 'Turn the wheel (does not seek or change video)' },
      { keys: ['Home', 'End'], action: 'First or last item' },
      { keys: ['Enter', 'Space'], action: 'Preview the film or scene in the gate; Play or Jump confirms' },
    ],
  },
  {
    title: 'Time Lens and Scene Dial',
    items: [
      { keys: ['T'], action: 'Open or close the Time Lens' },
      { keys: ['←', '→'], action: 'Move the lens one frame (Shift: one second); never seeks' },
      { keys: ['↑', '↓'], action: 'Zoom the lens in or out' },
      { keys: ['Enter'], action: 'Jump to the lens or dial position (leaves a return point)' },
      { keys: ['←', '→', 'Home', 'End'], action: 'Scene dial: choose the previous, next, first or last scene' },
    ],
  },
  {
    title: 'Menus and dialogs',
    items: [
      { keys: ['?'], action: 'Open this list' },
      { keys: ['Esc'], action: 'Close a dialog, menu or panel and return focus' },
      { keys: ['←', '→'], action: 'Switch settings categories (when a category tab has focus)' },
      { keys: ['Tab', 'Shift', '+', 'Tab'], action: 'Move forward or back through controls' },
    ],
  },
];

/** Flat list kept for anything that only needs the keys. */
export const SHORTCUTS: Shortcut[] = SHORTCUT_GROUPS.flatMap((g) => g.items);

export function KeymapDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const groups = SHORTCUT_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((s) => !q || `${g.title} ${s.action} ${s.keys.join(' ')}`.toLowerCase().includes(q)),
  })).filter((g) => g.items.length > 0);

  return (
    <ModalDialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <p className="cs-muted">
        Shortcuts work while focus is inside the player. They pause while you type in a field, and a focused slider or the wheel uses
        its own arrow keys first.
      </p>
      <label className="cs-search">
        <span className="cs-sr">Search shortcuts</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search shortcuts, for example “mute”" />
      </label>
      <p className="cs-sr" role="status">
        {q ? `${groups.reduce((n, g) => n + g.items.length, 0)} shortcuts match` : ''}
      </p>
      {groups.length === 0 ? (
        <p className="cs-empty">No shortcut matches “{query.trim()}”.</p>
      ) : (
        groups.map((g) => (
          <section key={g.title} className="cs-keygroup" aria-label={g.title}>
            <h3 className="cs-label">{g.title}</h3>
            <ul className="cs-keylist">
              {g.items.map((s) => (
                <li key={s.action} className="cs-keyrow">
                  <span className="cs-keys">
                    {s.keys.map((k, i) => (
                      <kbd key={`${k}-${i}`}>{k}</kbd>
                    ))}
                  </span>
                  <span>{s.action}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </ModalDialog>
  );
}
