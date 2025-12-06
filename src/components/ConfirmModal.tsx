import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  onConfirm?: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  variant = 'primary',
  onConfirm,
  onClose
}: ConfirmModalProps) {
  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={title}
      size="sm"
    >
      {message && (
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
          {message}
        </p>
      )}
      <ModalFooter>
        {cancelText && (
          <Button variant="secondary" onClick={onClose}>
            {cancelText}
          </Button>
        )}
        <Button variant={variant} onClick={handleConfirm}>
          {confirmText}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
