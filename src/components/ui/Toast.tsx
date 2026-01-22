import { useCallback, useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { ToastContext, type Toast, type ToastType } from './toast-context';

const toastIcons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
};

const toastStyles: Record<ToastType, string> = {
    success: 'bg-green-50 border-green-200 dark:bg-green-950/50 dark:border-green-800',
    error: 'bg-red-50 border-red-200 dark:bg-red-950/50 dark:border-red-800',
    info: 'bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:border-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/50 dark:border-yellow-800',
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onRemove, toast.duration || 5000);
        return () => clearTimeout(timer);
    }, [toast.duration, onRemove]);

    return (
        <div
            className={`
        flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg
        animate-slide-in-right
        ${toastStyles[toast.type]}
      `}
            role="alert"
            aria-live="polite"
        >
            {toastIcons[toast.type]}
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1">
                {toast.message}
            </p>
            <button
                onClick={onRemove}
                className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                aria-label="Закрыть уведомление"
            >
                <X className="w-4 h-4 text-gray-500" />
            </button>
        </div>
    );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((type: ToastType, message: string, duration = 5000) => {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setToasts((prev) => [...prev, { id, type, message, duration }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
            {children}
            {/* Toast Container - top right */}
            <div
                className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
                aria-label="Уведомления"
            >
                {toasts.map((toast) => (
                    <div key={toast.id} className="pointer-events-auto">
                        <ToastItem toast={toast} onRemove={() => removeToast(toast.id)} />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
