import { useRef, useState, useEffect } from 'react';
import { Upload, CheckCircle, ArrowRight, Download, Save } from 'lucide-react';
import { useAppStore } from '../stores';
import { DatasetLibrary } from './DatasetLibrary';

interface DataUploadProps {
  onNext?: () => void;
}

export function DataUpload({ onNext }: DataUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [ticker, setTicker] = useState('');
  const [datasetName, setDatasetName] = useState('');
  const { marketData, currentDataset, /* uploadData, */ loadJSONData, saveDatasetToServer, loadDatasetsFromServer, isLoading } = useAppStore();

  // Загружаем список датасетов при монтировании компонента
  useEffect(() => {
    loadDatasetsFromServer();
  }, [loadDatasetsFromServer]);

  const handleFileSelect = async (file: File) => {
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      await loadJSONData(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // Only accept JSON
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      handleFileSelect(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  // Удаляем использование тестовых данных

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
                  <div className="text-sm text-blue-700 dark:text-blue-300">Загружен датасет</div>
                  <div className="text-xl font-semibold text-blue-900 dark:text-blue-200">{currentDataset.ticker}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900/50">{currentDataset.ticker}</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700">{currentDataset.dataPoints.toLocaleString()} points</span>
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
            <div className="bg-gray-50 rounded-lg p-4 mb-4 dark:bg-gray-900/80 dark:border dark:border-gray-800">
              <h4 className="font-medium text-gray-900 mb-3 dark:text-gray-100">Быстрые действия</h4>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input type="text" placeholder="Ticker (e.g., AAPL)" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
                  <input type="text" placeholder="Dataset name (optional)" value={datasetName} onChange={(e) => setDatasetName(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => { if (ticker.trim()) { await saveDatasetToServer(ticker.trim(), datasetName.trim() || undefined); setTicker(''); setDatasetName(''); } }} disabled={!ticker.trim() || isLoading} className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 text-sm font-medium hover-lift">
                    <Save className="w-4 h-4" />
                    {isLoading ? 'Saving...' : 'Save to Server'}
                  </button>
                  <button onClick={() => jsonInputRef.current?.click()} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium hover-lift">
                    <Download className="w-4 h-4" />
                    Import JSON
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Список тикеров ниже карточки (всегда доступен) */}
        <div className="mt-6">
          <DatasetLibrary onAfterLoad={onNext} />
        </div>

        <div className="space-y-4">
          
          {onNext && (
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
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div
        className="relative rounded-2xl border-2 border-dashed border-gray-300 bg-white p-10 text-center shadow-sm hover:shadow-md transition dark:bg-gray-900 dark:border-gray-700"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
          <Upload className="h-8 w-8 text-blue-600" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2 dark:text-gray-100">Загрузите данные для тестирования</h3>
        <p className="text-gray-600 mb-6 dark:text-gray-300">Перетащите JSON-файл сюда или выберите его вручную.</p>
        <div className="flex items-center justify-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleFileInput}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 font-medium text-white shadow hover:bg-blue-700"
          >
            <Upload className="h-4 w-4" /> Выбрать JSON
          </button>
          <button
            onClick={() => document.getElementById('dataset-library')?.scrollIntoView({ behavior: 'smooth' })}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <Download className="h-4 w-4" /> Выбрать из библиотеки
          </button>
        </div>
      </div>

      <div id="dataset-library" className="mt-10">
        <DatasetLibrary />
      </div>
    </div>
  );
}