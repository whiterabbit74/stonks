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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative w-full max-w-md mx-4 rounded-lg bg-white shadow-lg ring-2 ${ring} flex flex-col max-h-[80vh]`}>
        <div className="px-5 py-4 border-b shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          <p className="text-sm text-gray-700 whitespace-pre-line">{message}</p>
        </div>
        <div className="px-5 py-3 border-t flex items-center justify-end shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-gray-900 text-white text-sm">ОК</button>
        </div>
      </div>
    </div>
  );
}



