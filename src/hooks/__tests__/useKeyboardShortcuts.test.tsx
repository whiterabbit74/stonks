import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KEYBOARD_SHORTCUTS, useAppShortcuts, useKeyboardShortcuts } from '../useKeyboardShortcuts';

function ShortcutHarness({
  action,
  enabled = true,
  key = 'k',
  ctrl = true,
}: {
  action: () => void;
  enabled?: boolean;
  key?: string;
  ctrl?: boolean;
}) {
  useKeyboardShortcuts([{ key, ctrl, action, description: 'test' }], enabled);
  return (
    <div>
      <input aria-label="Search" />
      <textarea aria-label="Notes" />
    </div>
  );
}

describe('useKeyboardShortcuts', () => {
  it('fires the matching shortcut and ignores typing inside form fields', () => {
    const action = vi.fn();
    render(<ShortcutHarness action={action} />);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(action).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'k', ctrlKey: true });
    fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'k', ctrlKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('treats the meta key as ctrl when the shortcut asks for ctrl', () => {
    const action = vi.fn();
    render(<ShortcutHarness action={action} />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('does not listen while disabled', () => {
    const action = vi.fn();
    render(<ShortcutHarness action={action} enabled={false} />);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(action).not.toHaveBeenCalled();
  });

  it('adds a keydown listener and removes the same handler on cleanup', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const action = vi.fn();

    const { unmount } = renderHook(() =>
      useKeyboardShortcuts([{ key: 'k', ctrl: true, action }])
    );

    const attached = addSpy.mock.calls.find((call) => call[0] === 'keydown');
    expect(attached).toBeTruthy();

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', attached?.[1]);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('fires a shortcut declared with meta: true when the meta key is held', () => {
    const action = vi.fn();
    function MetaHarness() {
      useKeyboardShortcuts([{ key: 'k', meta: true, action }]);
      return null;
    }
    render(<MetaHarness />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe('useAppShortcuts', () => {
  it('wires the documented preset chords', () => {
    const onSearch = vi.fn();
    const onHelp = vi.fn();
    const onSettings = vi.fn();
    const onRefresh = vi.fn();

    function AppHarness() {
      useAppShortcuts({ onSearch, onHelp, onSettings, onRefresh });
      return null;
    }
    render(<AppHarness />);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    fireEvent.keyDown(document, { key: '?' });
    fireEvent.keyDown(document, { key: ',', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'r', ctrlKey: true, shiftKey: true });

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onHelp).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('exports the help-table copy for those presets', () => {
    expect(KEYBOARD_SHORTCUTS.map((item) => item.keys.join('+'))).toEqual([
      'Ctrl+K',
      '?',
      'Ctrl+,',
      'Ctrl+Shift+R',
      'Escape',
    ]);
  });
});
