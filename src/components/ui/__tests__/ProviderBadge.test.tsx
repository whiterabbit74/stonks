import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PROVIDER_OPTIONS, ProviderBadge, providerDisplayName } from '../ProviderBadge';

describe('providerDisplayName', () => {
  it('maps known keys and falls back to the raw value', () => {
    expect(providerDisplayName('alpha_vantage')).toBe('Alpha Vantage');
    expect(providerDisplayName('webull')).toBe('Webull');
    expect(providerDisplayName('custom')).toBe('custom');
  });
});

describe('ProviderBadge', () => {
  it('shows the human-readable provider without a dropdown when it is not changeable', () => {
    render(<ProviderBadge label="Провайдер данных" provider="polygon" />);

    expect(screen.getByText('Провайдер данных')).toBeInTheDocument();
    expect(screen.getByText('Polygon')).toBeInTheDocument();
    expect(screen.queryByTitle('Сменить провайдер')).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lets the user pick another provider and then closes the menu', () => {
    const onChange = vi.fn();
    render(
      <ProviderBadge
        label="Провайдер данных"
        provider="finnhub"
        options={PROVIDER_OPTIONS}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByTitle('Сменить провайдер'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Finnhub' })).toHaveClass('text-indigo-600');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Twelve Data' }));
    expect(onChange).toHaveBeenCalledWith('twelve_data');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
