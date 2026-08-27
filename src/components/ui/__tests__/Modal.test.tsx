import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal, ModalFooter } from '../Modal';

describe('Modal', () => {
  it('does not render while closed', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Edit">
        Body
      </Modal>
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Body')).toBeNull();
  });

  it('renders in place (not a portal) with dialog semantics', () => {
    const { container } = render(
      <Modal isOpen onClose={vi.fn()} title="Edit">
        Body
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { name: 'Edit' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(container.querySelector('[role="dialog"]')).toBe(dialog);
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('closes on Escape and on overlay click', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Edit">
        Body
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    const overlay = screen.getByRole('dialog').querySelector('[aria-hidden="true"]');
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('honours closeOnEscape=false and closeOnOverlayClick=false', () => {
    const onClose = vi.fn();
    render(
      <Modal
        isOpen
        onClose={onClose}
        title="Locked"
        closeOnEscape={false}
        closeOnOverlayClick={false}
      >
        Body
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    const overlay = screen.getByRole('dialog').querySelector('[aria-hidden="true"]');
    fireEvent.click(overlay!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes from the header button and applies the size class', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Wide" size="xl">
        Body
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.max-w-xl')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks body scroll while open and restores it on close', () => {
    const { rerender, unmount } = render(
      <Modal isOpen onClose={vi.fn()} title="Edit">
        Body
      </Modal>
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Modal isOpen={false} onClose={vi.fn()} title="Edit">
        Body
      </Modal>
    );
    expect(document.body.style.overflow).toBe('');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('wraps Tab focus between the first and last focusable nodes', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Edit">
        <input aria-label="Name" />
      </Modal>
    );

    const closeButton = screen.getByRole('button', { name: 'Закрыть' });
    const input = screen.getByLabelText('Name');

    input.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(closeButton).toHaveFocus();

    closeButton.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(input).toHaveFocus();
  });

  it('renders ModalFooter actions inside the dialog body', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Edit">
        <ModalFooter>
          <button type="button">Confirm</button>
        </ModalFooter>
      </Modal>
    );

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });
});
