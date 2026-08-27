import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpTooltip } from '../HelpTooltip';

describe('HelpTooltip', () => {
  it('toggles the panel from the help button', () => {
    render(<HelpTooltip title="IBS" content="Close relative to the bar range" />);

    const button = screen.getByRole('button', { name: 'IBS' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Close relative to the bar range')).toBeNull();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('IBS')).toBeInTheDocument();
    expect(screen.getByText('Close relative to the bar range')).toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Close relative to the bar range')).toBeNull();
  });

  it('closes on outside mousedown and on Escape', () => {
    render(
      <div>
        <span>outside</span>
        <HelpTooltip content="Hint" size="lg" align="left" />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Показать справку' }));
    const hint = screen.getByText('Hint');
    expect(hint).toBeInTheDocument();
    expect(hint.parentElement).toHaveClass('w-80');
    expect(hint.parentElement).toHaveClass('left-0');

    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByText('Hint')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Показать справку' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Hint')).toBeNull();
  });
});
