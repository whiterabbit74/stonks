import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartContainer } from '../ChartContainer';

describe('ChartContainer', () => {
  it('renders children and the title when there is data', () => {
    render(
      <ChartContainer title="Equity" height={240}>
        <div>chart-body</div>
      </ChartContainer>
    );

    expect(screen.getByRole('heading', { name: 'Equity' })).toBeInTheDocument();
    expect(screen.getByText('chart-body')).toBeInTheDocument();
    expect(screen.getByText('chart-body').parentElement).toHaveStyle({ height: '240px' });
  });

  it('hides children and shows the empty message when isEmpty', () => {
    render(
      <ChartContainer isEmpty emptyMessage="Нет сделок" title="Equity" height={180}>
        <div>chart-body</div>
      </ChartContainer>
    );

    expect(screen.queryByText('chart-body')).toBeNull();
    expect(screen.getByText('Нет сделок')).toBeInTheDocument();
    expect(screen.getAllByText('Equity')).toHaveLength(2);
  });

  it('uses the default empty copy and a fallback height', () => {
    const { container } = render(
      <ChartContainer isEmpty>
        <div>chart-body</div>
      </ChartContainer>
    );

    expect(screen.getByText('Нет данных для отображения')).toBeInTheDocument();
    const emptyBox = container.querySelector('.border-dashed') as HTMLElement;
    expect(emptyBox).toHaveStyle({ height: '18rem' });
  });
});
