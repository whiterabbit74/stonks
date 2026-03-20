import { useEffect, useRef } from 'react';
import { ArrowRight, AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../stores';
import { DatasetLibrary } from './DatasetLibrary';
import { PageHeader } from './ui/PageHeader';

interface DataUploadProps {
  onNext?: () => void;
}

export function DataUpload({ onNext }: DataUploadProps) {
  const { marketData, savedDatasets, isLoading, error, loadDatasetsFromServer } = useAppStore();
  const requestedOnMountRef = useRef(false);

  // Fallback load: avoid duplicate fetch when datasets are already loaded by ProtectedLayout.
  useEffect(() => {
    if (requestedOnMountRef.current) return;
    if (savedDatasets.length > 0 || isLoading) return;
    requestedOnMountRef.current = true;

    loadDatasetsFromServer().catch((error) => {
      console.warn('Failed to load datasets:', error);
    });
  }, [loadDatasetsFromServer, savedDatasets.length, isLoading]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Данные"
        subtitle="Управление загруженными датасетами"
        actions={
          <Link
            to="/enhance"
            title="Загрузить новые данные из API"
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white p-2 text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-indigo-400"
          >
            <Download className="h-4 w-4" />
          </Link>
        }
      />

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Обновляем список датасетов…</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 dark:bg-red-950/30 dark:border-red-900/40">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium text-red-800 dark:text-red-200">Ошибка загрузки</div>
            <div className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</div>
          </div>
        </div>
      )}

      <DatasetLibrary onAfterLoad={onNext} />

      {onNext && marketData.length > 0 && (
        <div>
          <button
            onClick={onNext}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium hover-lift"
          >
            Дальше
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
