import { useEffect, useCallback } from 'react';

type KeyboardShortcut = {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean; // Cmd on Mac
    action: () => void;
    description?: string;
};

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            // Ignore when typing in inputs
            const target = e.target as HTMLElement;
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            ) {
                return;
            }

            for (const shortcut of shortcuts) {
                const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
                const ctrlMatch = (shortcut.ctrl ?? false) === (e.ctrlKey || e.metaKey);
                const shiftMatch = (shortcut.shift ?? false) === e.shiftKey;
                const altMatch = (shortcut.alt ?? false) === e.altKey;

                if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
                    e.preventDefault();
                    shortcut.action();
                    return;
                }
            }
        },
        [shortcuts]
    );

    useEffect(() => {
        if (!enabled) return;
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown, enabled]);
}

// Preset shortcuts hook for common actions
export function useAppShortcuts({
    onSearch,
    onHelp,
    onSettings,
    onRefresh,
}: {
    onSearch?: () => void;
    onHelp?: () => void;
    onSettings?: () => void;
    onRefresh?: () => void;
}) {
    const shortcuts: KeyboardShortcut[] = [];

    if (onSearch) {
        shortcuts.push({
            key: 'k',
            ctrl: true,
            action: onSearch,
            description: 'Открыть поиск',
        });
    }

    if (onHelp) {
        shortcuts.push({
            key: '?',
            action: onHelp,
            description: 'Показать горячие клавиши',
        });
    }

    if (onSettings) {
        shortcuts.push({
            key: ',',
            ctrl: true,
            action: onSettings,
            description: 'Открыть настройки',
        });
    }

    if (onRefresh) {
        shortcuts.push({
            key: 'r',
            ctrl: true,
            shift: true,
            action: onRefresh,
            description: 'Обновить данные',
        });
    }

    useKeyboardShortcuts(shortcuts);
}

// Keyboard shortcuts help modal content
export const KEYBOARD_SHORTCUTS = [
    { keys: ['Ctrl', 'K'], description: 'Открыть поиск' },
    { keys: ['?'], description: 'Показать горячие клавиши' },
    { keys: ['Ctrl', ','], description: 'Открыть настройки' },
    { keys: ['Ctrl', 'Shift', 'R'], description: 'Обновить данные' },
    { keys: ['Escape'], description: 'Закрыть модальное окно' },
];
