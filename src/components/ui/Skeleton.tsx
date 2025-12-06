interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular';
    width?: string | number;
    height?: string | number;
    lines?: number;
    animate?: boolean;
}

export function Skeleton({
    className = '',
    variant = 'rectangular',
    width,
    height,
    lines = 1,
    animate = true,
}: SkeletonProps) {
    const baseStyles = `
    bg-gray-200 dark:bg-gray-700
    ${animate ? 'animate-pulse' : ''}
  `.trim();

    const variantStyles = {
        text: 'rounded h-4',
        circular: 'rounded-full',
        rectangular: 'rounded-lg',
    };

    const style: React.CSSProperties = {
        width: width || '100%',
        height: height || (variant === 'text' ? '1rem' : undefined),
    };

    if (lines > 1 && variant === 'text') {
        return (
            <div className={`space-y-2 ${className}`}>
                {Array.from({ length: lines }).map((_, i) => (
                    <div
                        key={i}
                        className={`${baseStyles} ${variantStyles.text}`}
                        style={{
                            ...style,
                            width: i === lines - 1 ? '80%' : '100%',
                        }}
                    />
                ))}
            </div>
        );
    }

    return (
        <div
            className={`${baseStyles} ${variantStyles[variant]} ${className}`}
            style={style}
        />
    );
}

// Preset skeletons for common use cases
export function SkeletonCard() {
    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <div className="flex items-center gap-4">
                <Skeleton variant="circular" width={48} height={48} />
                <div className="flex-1 space-y-2">
                    <Skeleton variant="text" width="60%" />
                    <Skeleton variant="text" width="40%" />
                </div>
            </div>
            <Skeleton variant="text" lines={3} />
            <div className="flex gap-2">
                <Skeleton variant="rectangular" width={100} height={36} />
                <Skeleton variant="rectangular" width={100} height={36} />
            </div>
        </div>
    );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
    return (
        <div className="space-y-2">
            {/* Header */}
            <div className="flex gap-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                {Array.from({ length: cols }).map((_, i) => (
                    <Skeleton key={i} variant="text" width={`${100 / cols}%`} height={20} />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex gap-4 py-3">
                    {Array.from({ length: cols }).map((_, colIndex) => (
                        <Skeleton key={colIndex} variant="text" width={`${100 / cols}%`} />
                    ))}
                </div>
            ))}
        </div>
    );
}

export function SkeletonChart({ height = 300 }: { height?: number }) {
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <Skeleton variant="text" width={150} />
                <div className="flex gap-2">
                    <Skeleton variant="rectangular" width={80} height={32} />
                    <Skeleton variant="rectangular" width={80} height={32} />
                </div>
            </div>
            <Skeleton variant="rectangular" height={height} />
        </div>
    );
}
