import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Input } from '../Input';

describe('Input', () => {
  it('forwards value, onChange, extra class, and the ref', () => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    render(
      <Input
        ref={ref}
        value="AAPL"
        onChange={onChange}
        className="extra"
        placeholder="Ticker"
      />
    );

    const input = screen.getByPlaceholderText('Ticker');
    expect(input).toHaveValue('AAPL');
    expect(input).toHaveClass('extra');
    expect(ref.current).toBe(input);

    fireEvent.change(input, { target: { value: 'MSFT' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('forwards the native disabled attribute', () => {
    render(<Input disabled value="" onChange={vi.fn()} aria-label="Name" />);
    expect(screen.getByLabelText('Name')).toBeDisabled();
  });
});
