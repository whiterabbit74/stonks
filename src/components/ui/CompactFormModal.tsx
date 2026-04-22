import type { ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';
import { Modal, ModalFooter } from './Modal';

interface CompactFormModalProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  error?: string | null;
  loading?: boolean;
  submitDisabled?: boolean;
  submitLabel: string;
  submitVariant?: ButtonVariant;
  cancelLabel?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClose: () => void;
  onSubmit: () => Promise<void> | void;
  children: ReactNode;
}

export function CompactFormModal({
  open,
  title,
  description = null,
  error = null,
  loading = false,
  submitDisabled = false,
  submitLabel,
  submitVariant = 'primary',
  cancelLabel = 'Отмена',
  size = 'md',
  onClose,
  onSubmit,
  children,
}: CompactFormModalProps) {
  return (
    <Modal isOpen={open} onClose={onClose} title={title} size={size}>
      <div className="space-y-4">
        {description ? (
          <div className="text-sm text-gray-600 dark:text-gray-300">{description}</div>
        ) : null}

        {children}

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={submitVariant}
          onClick={() => void onSubmit()}
          isLoading={loading}
          disabled={submitDisabled}
        >
          {submitLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
