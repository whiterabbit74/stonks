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
  const { marketData, currentDataset, uploadData, loadJSONData, saveDatasetToServer, loadDatasetsFromServer, isLoading } = useAppStore();

  // Загружаем список датасетов при монтировании компонента
  useEffect(() => {
    loadDatasetsFromServer();
  }, [loadDatasetsFromServer]);

  const handleFileSelect = async (file: File) => {
    if (file.type === 'text/csv') {
      await uploadData(file);
    } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
      await loadJSONData(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
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
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-b from-blue-50 to-white p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
                  <CheckCircle className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-blue-700">Загружен датасет</div>
                  <div className="text-xl font-semibold text-blue-900">{currentDataset.ticker}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">{currentDataset.ticker}</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border">{currentDataset.dataPoints.toLocaleString()} points</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border">{currentDataset.dateRange.from} — {currentDataset.dateRange.to}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Данные загружены</h3>
            <p className="text-gray-600 mb-4">{marketData.length} строк готовы для бэктеста</p>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h4 className="font-medium text-gray-900 mb-3">Быстрые действия</h4>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input type="text" placeholder="Ticker (e.g., AAPL)" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm" />
                  <input type="text" placeholder="Dataset name (optional)" value={datasetName} onChange={(e) => setDatasetName(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm" />
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => { if (ticker.trim()) { await saveDatasetToServer(ticker.trim(), datasetName.trim() || undefined); setTicker(''); setDatasetName(''); } }} disabled={!ticker.trim() || isLoading} className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 text-sm font-medium">
                    <Save className="w-4 h-4" />
                    {isLoading ? 'Saving...' : 'Save to Server'}
                  </button>
                  <button onClick={() => jsonInputRef.current?.click()} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium">
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
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium"
              >
                Дальше
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          className="hidden"
        />
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
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Upload Market Data
        </h2>
        <p className="text-gray-600">
          Upload a CSV file with OHLCV data, load a saved JSON dataset, or use our sample data
        </p>
      </div>

      {/* Dataset Library */}
      <DatasetLibrary />

      {/* File Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-lg font-medium text-gray-900 mb-2">
          Drop your CSV or JSON file here
        </p>
        <p className="text-gray-600 mb-4">
          or click to browse files
        </p>
        <p className="text-sm text-gray-500">
          CSV: Date, Open, High, Low, Close, Volume | JSON: Saved dataset format
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json"
        onChange={handleFileInput}
        className="hidden"
      />

      {/* Sample Data Button — intentionally removed */}
    </div>
  );
}