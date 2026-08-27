import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('uses the variant copy when title and description are omitted', () => {
    render(<EmptyState variant="noData" />);

    expect(screen.getByRole('heading', { name: 'Нет загруженных данных' })).toBeInTheDocument();
    expect(screen.getByText('Загрузите датасет для начала работы')).toBeInTheDocument();
  });

  it('lets callers override the title and description', () => {
    render(
      <EmptyState variant="error" title="Custom title" description="Custom hint" />
    );

    expect(screen.getByRole('heading', { name: 'Custom title' })).toBeInTheDocument();
    expect(screen.getByText('Custom hint')).toBeInTheDocument();
    expect(screen.queryByText('Произошла ошибка')).toBeNull();
  });

  it('renders an action only when both label and handler are provided', () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <EmptyState actionLabel="Upload" />
    );
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<EmptyState onAction={onAction} />);
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<EmptyState actionLabel="Upload" onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
