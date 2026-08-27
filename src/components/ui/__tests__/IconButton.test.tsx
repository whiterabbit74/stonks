import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IconButton, getIconButtonClasses } from '../IconButton';

describe('IconButton', () => {
  it('defaults to type=button, outline, and md size', () => {
    render(<IconButton aria-label="More">···</IconButton>);

    const button = screen.getByRole('button', { name: 'More' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('h-9');
    expect(button).toHaveClass('border-gray-300');
  });

  it('swaps in active styles for the chosen variant', () => {
    render(
      <IconButton variant="ghost" size="sm" active aria-label="On">
        *
      </IconButton>
    );

    const button = screen.getByRole('button', { name: 'On' });
    expect(button).toHaveClass('h-8');
    expect(button).toHaveClass('bg-indigo-50');
    expect(button).toHaveClass('text-indigo-700');
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <IconButton disabled onClick={onClick} aria-label="Close">
        x
      </IconButton>
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('getIconButtonClasses', () => {
  it('returns the same class contract the button uses', () => {
    const classes = getIconButtonClasses({
      variant: 'glass',
      size: 'lg',
      active: true,
      className: 'extra',
    });

    expect(classes).toContain('h-10');
    expect(classes).toContain('bg-indigo-600');
    expect(classes).toContain('extra');
  });
});
