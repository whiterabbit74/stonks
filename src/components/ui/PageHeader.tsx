interface PageHeaderProps {
  title: string;
}

export function PageHeader({ title }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {title}
      </h1>
      <div className="mt-2 h-px bg-gradient-to-r from-blue-500/50 via-purple-500/50 to-transparent" />
    </div>
  );
}
