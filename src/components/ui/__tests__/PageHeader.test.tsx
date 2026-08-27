import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from '../PageHeader';

describe('PageHeader', () => {
  it('renders the title heading and optional subtitle', () => {
    render(<PageHeader title="Results" subtitle="Last backtest" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Results' })).toBeInTheDocument();
    expect(screen.getByText('Last backtest')).toBeInTheDocument();
  });

  it('places actions next to the title and omits the subtitle when missing', () => {
    render(
      <PageHeader title="Results" actions={<button type="button">Run</button>} />
    );

    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
    expect(screen.queryByText('Last backtest')).toBeNull();
  });
});
