interface FooterProps {
  apiBuildId: string | null;
}

export function Footer({ apiBuildId }: FooterProps) {
  const feBuildId = import.meta.env.VITE_BUILD_ID || 'dev';
  return (
    <footer className="bg-gray-900 text-gray-300 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4">
          <div className="text-center sm:text-left">
            <div className="text-lg font-semibold text-white">IBS Trading Backtester</div>
            <div className="text-xs text-gray-400">Internal Bar Strength Mean Reversion Strategy</div>
          </div>
          <div className="text-xs text-gray-400 text-center sm:text-right">
            <span className="inline-block border border-gray-700 rounded px-2 py-0.5 mr-1">FE: {feBuildId}</span>
            <span className="inline-block border border-gray-700 rounded px-2 py-0.5">API: {apiBuildId || '-'}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}