import React, { useEffect } from 'react';
import { CheckCircle, ArrowRight, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../stores';
import { DatasetLibrary } from './DatasetLibrary';
import { API_BASE_URL } from '../lib/api';

interface DataUploadProps {
  onNext?: () => void;
}

export function DataUpload({ onNext }: DataUploadProps) {
  const { marketData, currentDataset, isLoading, error, loadDatasetsFromServer } = useAppStore();

  // Загружаем список датасетов при монтировании компонента ТОЛЬКО после успешной авторизации
  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/check`, { credentials: 'include' }).then(r => {
      if (r.ok) loadDatasetsFromServer();
    }).catch((error) => {
      console.warn('Auth check failed:', error);
      // Silently fail auth check - user can still work offline
    });
  }, [loadDatasetsFromServer]);

  if (marketData.length > 0) {
    return (
      <div className="space-y-6">
        {/* Список тикеров показан ниже карточки */}

        {/* Summary card */}
        {currentDataset ? (
          <div className="mx-auto max-w-2xl">
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-b from-blue-50 to-white p-5 shadow-sm dark:from-gray-900 dark:to-gray-900 dark:border-gray-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full dark:bg-blue-950/40">
                  <CheckCircle className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-blue-700 dark:text-blue-300">Датасет загружен</div>
                  <div className="text-xl font-semibold text-blue-900 dark:text-blue-200">{currentDataset.companyName || currentDataset.ticker}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900/50">{currentDataset.ticker}</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700">{currentDataset.dataPoints.toLocaleString()} точек</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700">{currentDataset.dateRange.from} — {currentDataset.dateRange.to}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4 dark:bg-green-900/30">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-gray-100">Данные загружены</h3>
            <p className="text-gray-600 mb-4 dark:text-gray-300">{marketData.length} строк готовы для бэктеста</p>

          </div>
        )}

        {/* Библиотека датасетов (всегда доступна) */}
        <div className="mt-6 relative">
          {isLoading && (
            <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm z-10 rounded-lg" />
          )}
          <DatasetLibrary onAfterLoad={onNext} />
        </div>

        {onNext && (
          <div className="space-y-4">
            <div>
              <button
                onClick={onNext}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium hover-lift"
              >
                Дальше
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2 dark:text-gray-100">Данные</h2>
        <p className="text-gray-600 dark:text-gray-300">Управление загруженными датасетами</p>
      </div>

      {/* Error Notification */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 dark:bg-red-950/30 dark:border-red-900/40">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium text-red-800 dark:text-red-200">Ошибка загрузки</div>
            <div className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</div>
          </div>
        </div>
      )}

      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm z-10 rounded-lg" />
        )}
        <DatasetLibrary />
      </div>
    </div>
  );
}

