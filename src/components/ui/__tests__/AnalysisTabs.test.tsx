import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisTabs } from '../AnalysisTabs';

const tabs = [
  { id: 'overview', label: 'Обзор' },
  { id: 'trades', label: 'Сделки' },
  { id: 'equity', label: 'Эквити' },
];

describe('AnalysisTabs', () => {
  it('marks the active tab and notifies onChange when another tab is chosen', () => {
    const onChange = vi.fn();
    render(<AnalysisTabs tabs={tabs} activeTab="overview" onChange={onChange} />);

    const overview = screen.getByRole('tab', { name: 'Обзор' });
    const trades = screen.getByRole('tab', { name: 'Сделки' });

    expect(overview).toHaveAttribute('aria-selected', 'true');
    expect(trades).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(trades);
    expect(onChange).toHaveBeenCalledWith('trades');
    expect(onChange).not.toHaveBeenCalledWith('overview');
  });

  it('keeps only the selected tab in the tab order', () => {
    render(<AnalysisTabs tabs={tabs} activeTab="trades" onChange={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'Сделки' })).toHaveAttribute('tabIndex', '0');
    expect(screen.getByRole('tab', { name: 'Обзор' })).toHaveAttribute('tabIndex', '-1');
    expect(screen.getByRole('tab', { name: 'Эквити' })).toHaveAttribute('tabIndex', '-1');
  });

  it('reports tab intent on hover, focus, and touch', () => {
    const onTabIntent = vi.fn();
    render(
      <AnalysisTabs
        tabs={tabs}
        activeTab="overview"
        onChange={vi.fn()}
        onTabIntent={onTabIntent}
      />
    );

    const trades = screen.getByRole('tab', { name: 'Сделки' });
    fireEvent.mouseEnter(trades);
    fireEvent.focus(trades);
    fireEvent.touchStart(trades);

    expect(onTabIntent).toHaveBeenCalledTimes(3);
    expect(onTabIntent).toHaveBeenCalledWith('trades');
  });
});
