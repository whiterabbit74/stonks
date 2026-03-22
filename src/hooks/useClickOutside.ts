import { useEffect } from 'react';

/**
 * Closes a popup when a mousedown occurs outside the given element.
 * Optionally also closes on Escape key.
 *
 * @param ref       - ref attached to the popup container element
 * @param isOpen    - whether the popup is currently open (hook no-ops when false)
 * @param onClose   - callback to close the popup
 * @param closeOnEscape - also close on Escape key (default: true)
 */
export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
  closeOnEscape = true,
) {
  useEffect(() => {
    if (!isOpen) return;

    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('mousedown', handleMouseDown);
    if (closeOnEscape) document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      if (closeOnEscape) document.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, isOpen, onClose, closeOnEscape]);
}
