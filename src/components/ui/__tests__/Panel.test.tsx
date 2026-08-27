import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Panel } from '../Panel';

describe('Panel', () => {
  it('renders as the requested element with default tone, padding, and shadow', () => {
    render(
      <Panel as="section" aria-label="Metrics">
        content
      </Panel>
    );

    const panel = screen.getByLabelText('Metrics');
    expect(panel.tagName).toBe('SECTION');
    expect(panel).toHaveClass('bg-white');
    expect(panel).toHaveClass('p-4');
    expect(panel).toHaveClass('rounded-xl');
    expect(panel).toHaveClass('shadow-sm');
  });

  it('swaps tone, padding, radius, and can drop the shadow', () => {
    render(
      <Panel tone="subtle" padding="none" radius="2xl" shadow={false}>
        content
      </Panel>
    );

    const panel = screen.getByText('content');
    expect(panel).toHaveClass('bg-gray-50/80');
    expect(panel).toHaveClass('rounded-2xl');
    expect(panel).not.toHaveClass('p-4');
    expect(panel).not.toHaveClass('shadow-sm');
  });
});
