import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompactFormModal } from '../CompactFormModal';

const baseProps = {
  title: 'New ticker',
  submitLabel: 'Save',
  onClose: () => {},
  onSubmit: () => {},
};

describe('CompactFormModal', () => {
  it('does not mount the dialog while closed', () => {
    render(
      <CompactFormModal {...baseProps} open={false}>
        <span>fields</span>
      </CompactFormModal>
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows description, error, and children when open', () => {
    render(
      <CompactFormModal
        {...baseProps}
        open
        description="Fill the form"
        error="Ticker is required"
      >
        <label>
          Symbol
          <input />
        </label>
      </CompactFormModal>
    );

    expect(screen.getByRole('dialog', { name: 'New ticker' })).toBeInTheDocument();
    expect(screen.getByText('Fill the form')).toBeInTheDocument();
    expect(screen.getByText('Ticker is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Symbol')).toBeInTheDocument();
  });

  it('submits from the primary button and cancels from the secondary', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <CompactFormModal
        {...baseProps}
        open
        onSubmit={onSubmit}
        onClose={onClose}
        cancelLabel="Back"
      >
        fields
      </CompactFormModal>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables both actions while loading and the submit button while submitDisabled', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <CompactFormModal
        {...baseProps}
        open
        loading
        onSubmit={onSubmit}
        onClose={onClose}
      >
        fields
      </CompactFormModal>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Загрузка...' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled();

    rerender(
      <CompactFormModal
        {...baseProps}
        open
        submitDisabled
        onSubmit={onSubmit}
        onClose={onClose}
      >
        fields
      </CompactFormModal>
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
