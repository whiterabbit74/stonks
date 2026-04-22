import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface InfoModalProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
  kind?: 'success' | 'error' | 'info';
}

export function InfoModal({ open, title, message, onClose, kind = 'info' }: InfoModalProps) {
  if (!open) return null;
  const ring = kind === 'success' ? 'ring-green-500' : kind === 'error' ? 'ring-red-500' : 'ring-blue-500';
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={title}
      size="md"
      contentClassName={`ring-2 ${ring}`}
      showCloseButton={false}
    >
      <div className="space-y-4">
        <p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{message}</p>
        <div className="flex justify-end">
          <Button onClick={onClose}>ОК</Button>
        </div>
      </div>
    </Modal>
  );
}
