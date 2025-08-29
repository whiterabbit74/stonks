import React from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onClose: () => void;
}

export function ConfirmModal({ open, title, message, confirmText = 'Подтвердить', cancelText = 'Отмена', onConfirm, onClose }: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 rounded-lg bg-white shadow-lg border dark:bg-gray-900 dark:border-gray-800">
        <div className="px-5 py-4 border-b dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="px-5 py-4">
          {message && <p className="text-sm text-gray-700 whitespace-pre-line">{message}</p>}
        </div>
        <div className="px-5 py-3 border-t dark:border-gray-800 flex items-center justify-end gap-2">
          {cancelText && (
            <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100">
              {cancelText}
            </button>
          )}
          <button
            onClick={() => { if (onConfirm) { onConfirm(); } }}
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}



