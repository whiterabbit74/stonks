import { Database, BarChart3, Search, Inbox, AlertCircle } from 'lucide-react';
import { Button } from './Button';

type EmptyStateVariant = 'default' | 'noData' | 'noResults' | 'error' | 'noCharts';

interface EmptyStateProps {
    variant?: EmptyStateVariant;
    title?: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    icon?: React.ReactNode;
}

const defaultContent: Record<EmptyStateVariant, { icon: React.ReactNode; title: string; description: string }> = {
    default: {
        icon: <Inbox className="w-12 h-12" />,
        title: 'Нет данных',
        description: 'Здесь пока ничего нет',
    },
    noData: {
        icon: <Database className="w-12 h-12" />,
        title: 'Нет загруженных данных',
        description: 'Загрузите датасет для начала работы',
    },
    noResults: {
        icon: <Search className="w-12 h-12" />,
        title: 'Ничего не найдено',
        description: 'Попробуйте изменить параметры поиска',
    },
    noCharts: {
        icon: <BarChart3 className="w-12 h-12" />,
        title: 'Нет данных для графика',
        description: 'Запустите бэктест для отображения результатов',
    },
    error: {
        icon: <AlertCircle className="w-12 h-12" />,
        title: 'Произошла ошибка',
        description: 'Не удалось загрузить данные. Попробуйте ещё раз',
    },
};

export function EmptyState({
    variant = 'default',
    title,
    description,
    actionLabel,
    onAction,
    icon,
}: EmptyStateProps) {
    const content = defaultContent[variant];
    const displayIcon = icon || content.icon;
    const displayTitle = title || content.title;
    const displayDescription = description || content.description;

    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="text-gray-400 dark:text-gray-500 mb-4">
                {displayIcon}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {displayTitle}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-6">
                {displayDescription}
            </p>
            {actionLabel && onAction && (
                <Button onClick={onAction} variant="primary">
                    {actionLabel}
                </Button>
            )}
        </div>
    );
}
