import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useClickOutside } from '../useClickOutside';

function Harness({
  isOpen,
  onClose,
  closeOnEscape,
}: {
  isOpen: boolean;
  onClose: () => void;
  closeOnEscape?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, isOpen, onClose, closeOnEscape);
  return (
    <div>
      <div data-testid="outside">outside</div>
      <div ref={ref} data-testid="inside">
        inside
        <button type="button">inner</button>
      </div>
    </div>
  );
}

describe('useClickOutside', () => {
  it('calls onClose for mousedown outside the ref and ignores mousedown inside', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);

    fireEvent.mouseDown(screen.getByTestId('inside'));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'inner' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing while closed', () => {
    const onClose = vi.fn();
    render(<Harness isOpen={false} onClose={onClose} />);

    fireEvent.mouseDown(screen.getByTestId('outside'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape unless closeOnEscape is false', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Harness isOpen onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Harness isOpen onClose={onClose} closeOnEscape={false} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('removes document listeners on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = render(<Harness isOpen onClose={onClose} />);

    unmount();
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
