import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../Toast';
import { useToast, useToastActions } from '../toast-context';

function ToastProbe({ duration }: { duration?: number }) {
  const { addToast, removeToast, toasts } = useToast();
  return (
    <div>
      <button type="button" onClick={() => addToast('success', 'Saved', duration)}>
        add
      </button>
      <button type="button" onClick={() => addToast('error', 'Failed', duration)}>
        add-error
      </button>
      {toasts.map((toast) => (
        <button key={toast.id} type="button" onClick={() => removeToast(toast.id)}>
          remove-{toast.type}
        </button>
      ))}
    </div>
  );
}

function ActionsProbe() {
  const toast = useToastActions();
  return (
    <button type="button" onClick={() => toast.warning('Careful', 8000)}>
      warn
    </button>
  );
}

describe('ToastProvider and toast-context', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when useToast is used outside a provider', () => {
    expect(() => renderHook(() => useToast())).toThrow(
      'useToast must be used within a ToastProvider'
    );
  });

  it('renders an alert for each added toast and dismisses it from the close button', () => {
    render(
      <ToastProvider>
        <ToastProbe />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Saved');

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('auto-dismisses after the given duration', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastProbe duration={1000} />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Saved');

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('alert')).toBeNull();

    vi.useRealTimers();
  });

  it('falls back to 5000ms when addToast is called without a duration', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastProbe />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('alert')).toBeNull();

    vi.useRealTimers();
  });

  it('maps useToastActions helpers onto addToast types', () => {
    render(
      <ToastProvider>
        <ActionsProbe />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'warn' }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Careful');
    expect(alert.className).toContain('border-yellow-200');
  });
});
