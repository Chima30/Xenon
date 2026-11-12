import { Card, Pill, Pills, SwitchRow } from '../ui';
import { PROFILES, usePrefs, type DockLayout } from './PrefsContext';

const LAYOUTS: { id: DockLayout; label: string; description: string }[] = [
  { id: 'floating', label: 'Floating', description: 'The transport floats over the picture; a console sits below it and rests when idle.' },
  { id: 'compact', label: 'Compact', description: 'One slim bar with the timeline inline. Tools move into More.' },
  { id: 'expanded', label: 'Expanded', description: 'A labelled console under the picture. It never covers the film and never hides.' },
];

/** Standard / High contrast / Large controls / Reduced motion. Anything can be tweaked afterwards. */
export function ProfileCard() {
  const { profile, applyProfile } = usePrefs();
  const current = PROFILES.find((p) => p.id === profile);
  return (
    <Card title="Accessibility profile" description="Start from a preset, then adjust individual options.">
      <Pills label="Accessibility profile">
        {PROFILES.map((p) => (
          <Pill key={p.id} selected={profile === p.id} onClick={() => applyProfile(p.id)}>
            {p.label}
          </Pill>
        ))}
      </Pills>
      <p className="cs-card-desc" role="status">
        {current ? current.description : 'Custom: your own mix of the options below.'}
      </p>
    </Card>
  );
}

export function ViewPrefsCard() {
  const { prefs, set } = usePrefs();
  return (
    <Card title="Viewing preferences" description="These apply to the whole player and are remembered in this browser.">
      <SwitchRow
        label="High contrast"
        description="Solid surfaces, strong borders, thick focus rings."
        checked={prefs.highContrast}
        onChange={(v) => set({ highContrast: v })}
      />
      <SwitchRow
        label="Large controls"
        description="Bigger buttons, larger text and more spacing."
        checked={prefs.largeControls}
        onChange={(v) => set({ largeControls: v })}
      />
      <SwitchRow
        label="Reduce motion"
        description="Turns off panel, wheel and background animation. Your system setting is also respected."
        checked={prefs.reducedMotion}
        onChange={(v) => set({ reducedMotion: v })}
      />
    </Card>
  );
}

export function DockCard() {
  const { prefs, set } = usePrefs();
  return (
    <Card title="Control dock" description="How the playback controls are arranged. Small players adapt automatically; play, seek, time, sound and fullscreen are always reachable.">
      <Pills label="Control arrangement">
        {LAYOUTS.map((l) => (
          <Pill key={l.id} selected={prefs.dockLayout === l.id} onClick={() => set({ dockLayout: l.id })}>
            {l.label}
          </Pill>
        ))}
      </Pills>
      <p className="cs-card-desc" role="status">
        {LAYOUTS.find((l) => l.id === prefs.dockLayout)?.description}
      </p>
      <SwitchRow
        label="Pause Canvas"
        description="When paused, show the title, where you are, the neighbouring scenes and quick actions beside the frame."
        checked={prefs.pauseCanvas}
        onChange={(v) => set({ pauseCanvas: v })}
      />
      <SwitchRow
        label="Show button labels"
        description="Text beside icons such as Save moment, when there is room."
        checked={prefs.dockLabels}
        onChange={(v) => set({ dockLabels: v })}
      />
      <SwitchRow
        label="Compact dock"
        description="Tighter spacing between playback controls."
        checked={prefs.dockCompact}
        onChange={(v) => set({ dockCompact: v })}
      />
    </Card>
  );
}
