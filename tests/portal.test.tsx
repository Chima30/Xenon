import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimePortal, type PortalStop } from '../src/features/TimePortal';

afterEach(cleanup);

const stops: PortalStop[] = [
  { time: 0, end: 88, title: 'Section 1', image: 'a.jpg', kind: 'Section' },
  { time: 266, end: 355, title: 'Section 4', image: null, kind: 'Section' },
  { time: 600, title: 'Dragon', kind: 'Saved moment', note: 'The reveal' },
];

function setup(over: Partial<Parameters<typeof TimePortal>[0]> = {}) {
  const props = {
    stops,
    index: 1,
    onIndex: vi.fn(),
    currentTime: 100,
    onJump: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  const utils = render(<TimePortal {...props} />);
  return { ...utils, props };
}

describe('TimePortal', () => {
  it('is a labelled dialog that focuses Jump here on open', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Section 4' });
    expect(dialog).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Jump here');
  });

  it('describes timing relative to the current position without seeking', () => {
    const { props } = setup();
    expect(screen.getByText(/2:46 ahead of you/)).toBeTruthy();
    expect(props.onJump).not.toHaveBeenCalled();
  });

  it('falls back gracefully when no still exists', () => {
    const { container } = setup();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('No still available')).toBeTruthy();
  });

  it('shows notes written by a person', () => {
    setup({ index: 2 });
    expect(screen.getByText('The reveal')).toBeTruthy();
  });

  it('Jump here hands back the inspected stop', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Jump here' }));
    expect(props.onJump).toHaveBeenCalledWith(stops[1]);
  });

  it('Keep watching and Escape both close without jumping', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Keep watching' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(props.onJump).not.toHaveBeenCalled();
  });

  it('steps between neighbouring scenes and disables at the ends', () => {
    const { props } = setup({ index: 0 });
    expect((screen.getByRole('button', { name: 'Nothing earlier' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Next: Section 4/ }));
    expect(props.onIndex).toHaveBeenCalledWith(1);
  });

  it('offers a one-click return when a Return Anchor exists', () => {
    const onReturn = vi.fn();
    setup({ anchorTime: 42, onReturn });
    fireEvent.click(screen.getByRole('button', { name: /Back to 0:42/ }));
    expect(onReturn).toHaveBeenCalled();
  });

  it('returns focus to the element that opened it', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    const { unmount } = setup({ returnFocusTo: opener });
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('keeps Escape and arrow keys from reaching the player', () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <TimePortal stops={stops} index={0} onIndex={vi.fn()} currentTime={0} onJump={vi.fn()} onClose={vi.fn()} />
      </div>,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(outer).not.toHaveBeenCalled();
  });
});
