import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Select } from '../Select';

describe('Select', () => {
  it('notifies onChange with the chosen option', () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Provider" value="finnhub" onChange={onChange}>
        <option value="finnhub">Finnhub</option>
        <option value="polygon">Polygon</option>
      </Select>
    );

    const select = screen.getByLabelText('Provider');
    expect(select).toHaveValue('finnhub');
    fireEvent.change(select, { target: { value: 'polygon' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('forwards the native disabled attribute', () => {
    render(
      <Select disabled aria-label="Provider">
        <option value="a">A</option>
      </Select>
    );

    expect(screen.getByLabelText('Provider')).toBeDisabled();
  });
});
