import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Label } from '../Label';

describe('Label', () => {
  it('associates the label with a control via htmlFor', () => {
    render(
      <>
        <Label htmlFor="ticker">Ticker</Label>
        <input id="ticker" />
      </>
    );

    expect(screen.getByLabelText('Ticker')).toBeInTheDocument();
  });

  it('exposes the description on the help icon title', () => {
    render(<Label description="Internal Bar Strength">IBS</Label>);

    expect(screen.getByText('IBS')).toBeInTheDocument();
    expect(screen.getByTitle('Internal Bar Strength')).toBeInTheDocument();
  });
});
