interface FooterProps {
  apiBuildId: string | null;
}

export function Footer({ apiBuildId }: FooterProps) {
  const feBuildId = import.meta.env.VITE_BUILD_ID || 'dev';
  return (
    <footer className="mt-auto border-t bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-800">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4">
          <div className="text-center sm:text-left">
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">IBS Trading Backtester</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Internal Bar Strength Mean Reversion Strategy</div>
          </div>
          <div className="text-xs text-gray-500 text-center sm:text-right dark:text-gray-400">
            <span className="inline-block border border-gray-300 rounded px-2 py-0.5 mr-1 bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">FE: {feBuildId}</span>
            <span className="inline-block border border-gray-300 rounded px-2 py-0.5 bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">API: {apiBuildId || '-'}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}