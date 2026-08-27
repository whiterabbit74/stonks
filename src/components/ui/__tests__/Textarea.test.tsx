import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Textarea } from '../Textarea';

describe('Textarea', () => {
  it('forwards value and onChange', () => {
    const onChange = vi.fn();
    render(<Textarea aria-label="Notes" value="hello" onChange={onChange} />);

    const textarea = screen.getByLabelText('Notes');
    expect(textarea).toHaveValue('hello');
    fireEvent.change(textarea, { target: { value: 'world' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stays disabled when the native attribute is set', () => {
    render(<Textarea disabled aria-label="Notes" />);
    expect(screen.getByLabelText('Notes')).toBeDisabled();
  });
});
