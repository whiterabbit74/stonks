import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
  it('applies the default primary/md classes and forwards the ref', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveClass('bg-indigo-600');
    expect(button).toHaveClass('min-h-[44px]');
    expect(ref.current).toBe(button);
  });

  it('maps variant and size to their style classes', () => {
    const { rerender } = render(
      <Button variant="danger" size="sm">
        Delete
      </Button>
    );

    expect(screen.getByRole('button')).toHaveClass('bg-red-600');
    expect(screen.getByRole('button')).toHaveClass('min-h-[36px]');

    rerender(
      <Button variant="ghost" size="lg">
        Ghost
      </Button>
    );
    expect(screen.getByRole('button')).toHaveClass('bg-transparent');
    expect(screen.getByRole('button')).toHaveClass('min-h-[52px]');
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('treats isLoading as disabled and replaces the label', () => {
    const onClick = vi.fn();
    render(
      <Button isLoading onClick={onClick}>
        Save
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Загрузка...' });
    expect(button).toBeDisabled();
    expect(screen.queryByText('Save')).toBeNull();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders icons and stretches to full width when asked', () => {
    render(
      <Button fullWidth leftIcon={<span>L</span>} rightIcon={<span>R</span>}>
        Go
      </Button>
    );

    const button = screen.getByRole('button', { name: /Go/ });
    expect(button).toHaveClass('w-full');
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
  });
});
