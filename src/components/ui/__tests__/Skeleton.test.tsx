import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton, SkeletonCard, SkeletonChart, SkeletonTable } from '../Skeleton';

describe('Skeleton', () => {
  it('applies variant geometry and optional pulse animation', () => {
    const { container, rerender } = render(
      <Skeleton variant="circular" width={48} height={48} />
    );

    const pulse = container.firstElementChild as HTMLElement;
    expect(pulse).toHaveClass('rounded-full');
    expect(pulse).toHaveClass('animate-pulse');
    expect(pulse).toHaveStyle({ width: '48px', height: '48px' });

    rerender(<Skeleton variant="rectangular" animate={false} />);
    expect(container.firstElementChild).toHaveClass('rounded-lg');
    expect(container.firstElementChild).not.toHaveClass('animate-pulse');
  });

  it('shortens the last line when rendering several text rows', () => {
    const { container } = render(<Skeleton variant="text" lines={3} />);
    const lines = container.querySelectorAll('.animate-pulse');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toHaveStyle({ width: '100%' });
    expect(lines[2]).toHaveStyle({ width: '80%' });
  });

  it('ignores lines when the variant is not text', () => {
    const { container } = render(<Skeleton variant="rectangular" lines={4} height={20} />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(1);
  });
});

describe('Skeleton presets', () => {
  it('builds a table with the requested rows and columns', () => {
    const { container } = render(<SkeletonTable rows={2} cols={3} />);
    // 1 header row + 2 body rows, 3 cells each
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(9);
  });

  it('applies the chart placeholder height', () => {
    const { container } = render(<SkeletonChart height={180} />);
    const blocks = container.querySelectorAll('.animate-pulse');
    const chart = Array.from(blocks).find(
      (el) => (el as HTMLElement).style.height === '180px'
    );
    expect(chart).toBeTruthy();
  });

  it('renders the card preset with a circular avatar', () => {
    const { container } = render(<SkeletonCard />);
    expect(container.querySelector('.rounded-full')).not.toBeNull();
  });
});
