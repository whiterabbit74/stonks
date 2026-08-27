import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuDivider, DropdownMenuItem } from '../DropdownMenu';

describe('DropdownMenu', () => {
  it('renders nothing while closed', () => {
    render(
      <DropdownMenu open={false}>
        <DropdownMenuItem>One</DropdownMenuItem>
      </DropdownMenu>
    );

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('aligns the menu and closes from the overlay when overlay is enabled', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <DropdownMenu open onClose={onClose} overlay align="left" widthClassName="min-w-[200px]">
        <DropdownMenuItem>One</DropdownMenuItem>
      </DropdownMenu>
    );

    const menu = screen.getByRole('menu');
    expect(menu).toHaveClass('left-0');
    expect(menu).toHaveClass('min-w-[200px]');

    fireEvent.click(document.querySelector('[aria-hidden="true"]')!);
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <DropdownMenu open overlay={false} align="right">
        <DropdownMenuItem>One</DropdownMenuItem>
      </DropdownMenu>
    );
    expect(screen.getByRole('menu')).toHaveClass('right-0');
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

describe('DropdownMenuItem and Divider', () => {
  it('fires onClick and applies active and danger styles', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <DropdownMenu open>
        <DropdownMenuItem onClick={onClick} active>
          Alpha
        </DropdownMenuItem>
      </DropdownMenu>
    );

    const item = screen.getByRole('menuitem', { name: 'Alpha' });
    expect(item).toHaveClass('text-indigo-600');
    fireEvent.click(item);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <DropdownMenu open>
        <DropdownMenuItem danger>Delete</DropdownMenuItem>
      </DropdownMenu>
    );
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass('text-red-600');
  });

  it('renders a separator', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuDivider />
      </DropdownMenu>
    );

    expect(screen.getByRole('separator')).toBeInTheDocument();
  });
});
