import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BottomNav } from '../BottomNav';

function renderNav(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>
  );
}

describe('BottomNav', () => {
  it('exposes the five primary destinations', () => {
    renderNav('/data');

    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Данные/ })).toHaveAttribute('href', '/data');
    expect(screen.getByRole('link', { name: /Акции/ })).toHaveAttribute('href', '/stocks');
    expect(screen.getByRole('link', { name: /EMA/ })).toHaveAttribute('href', '/ema');
    expect(screen.getByRole('link', { name: /Опционы/ })).toHaveAttribute('href', '/multi-ticker-options');
    expect(screen.getByRole('link', { name: /Брокер/ })).toHaveAttribute('href', '/broker');
  });

  it('marks the matching route as the current page', () => {
    renderNav('/ema');

    expect(screen.getByRole('link', { name: /EMA/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Данные/ })).not.toHaveAttribute('aria-current');
  });
});
