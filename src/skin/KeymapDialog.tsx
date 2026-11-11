import { ModalDialog } from './ModalDialog';

export interface Shortcut {
  keys: string[];
  action: string;
}

/** The single source of truth for bindings: the skin registers exactly these, the dialog lists exactly these. */
export const SHORTCUTS: Shortcut[] = [
  { keys: ['Space', 'K'], action: 'Play / pause' },
  { keys: ['←', 'J'], action: 'Back 10 seconds' },
  { keys: ['→', 'L'], action: 'Forward 10 seconds' },
  { keys: ['↑', '↓'], action: 'Volume up / down' },
  { keys: ['M'], action: 'Mute / unmute' },
  { keys: ['C'], action: 'Captions on / off (when a track exists)' },
  { keys: ['F'], action: 'Fullscreen' },
  { keys: ['I'], action: 'Picture-in-picture (when supported)' },
  { keys: ['?'], action: 'Open this list' },
  { keys: ['Esc'], action: 'Close a dialog, menu or panel' },
  { keys: ['↑', '↓', 'Home', 'End'], action: 'In the wheel: browse items (does not seek or change video)' },
  { keys: ['Enter'], action: 'In the wheel: select the highlighted film or scene' },
];

export function KeymapDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ModalDialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <p className="cs-muted">
        Shortcuts work while focus is inside the player. They are paused while you type in a field, and while the
        wheel or a slider has focus its own arrow keys take priority.
      </p>
      <table className="cs-keytable">
        <thead>
          <tr>
            <th scope="col">Keys</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.action}>
              <td>
                {s.keys.map((k, i) => (
                  <span key={k}>
                    {i > 0 ? ' ' : ''}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </td>
              <td>{s.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ModalDialog>
  );
}
