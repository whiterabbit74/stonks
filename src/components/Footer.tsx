interface FooterProps {
  apiBuildId: string | null;
}

export function Footer({ apiBuildId }: FooterProps) {
  const feBuildId = import.meta.env.VITE_BUILD_ID || 'dev';
  return (
    <footer className="mt-auto border-t bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-800">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
          <div className="text-center sm:text-left">
            <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">IBS Trading Backtester</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Internal Bar Strength Mean Reversion Strategy</div>
          </div>
          <div className="text-sm text-gray-500 text-center sm:text-right dark:text-gray-400">
            <span className="inline-block rounded-md px-3 py-1 mr-2 border border-gray-300 bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">FE: {feBuildId}</span>
            <span className="inline-block rounded-md px-3 py-1 border border-gray-300 bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">API: {apiBuildId || '-'}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}