import type { ReactNode } from 'react';

/** A settings card: strong title, short description, then controls. */
export function Card({
  title,
  description,
  children,
  wide,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className="cs-card" aria-label={title} data-wide={wide || undefined}>
      <header className="cs-card-head">
        <h3 className="cs-card-title">{title}</h3>
        {description ? <p className="cs-card-desc">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** Group of selection pills. Selected pills show a check mark as well as a colour, so colour is never the only cue. */
export function Pills({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="cs-chips" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function Pill({
  selected,
  onClick,
  children,
  disabled,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button type="button" className="cs-chip" aria-pressed={selected} aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** An on/off setting with a name and a one-line explanation. */
export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className="cs-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="cs-switch-text">
        <strong>{label}</strong>
        {description ? <span className="cs-card-desc">{description}</span> : null}
      </span>
      <span className="cs-switch-track" aria-hidden="true">
        <span className="cs-switch-knob" />
      </span>
      <span className="cs-sr">{checked ? 'On' : 'Off'}</span>
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="cs-empty">{children}</p>;
}
