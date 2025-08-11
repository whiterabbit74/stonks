import { useState, useEffect } from 'react';
import { Database, Download, Trash2, Calendar, BarChart3, Eye, EyeOff, Server, ServerOff } from 'lucide-react';
import { useAppStore } from '../stores';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { DatasetAPI } from '../lib/api';
import type { SavedDataset } from '../types';
import { ConfirmModal } from './ConfirmModal';

export function DatasetLibrary({ onAfterLoad }: { onAfterLoad?: () => void } = {}) {
  const { savedDatasets, currentDataset, currentStrategy, setStrategy, loadDatasetFromServer, deleteDatasetFromServer, exportDatasetAsJSON, loadDatasetsFromServer, runBacktest } = useAppStore() as any;
  const [isExpanded, setIsExpanded] = useState(true);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Проверяем статус сервера
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        await DatasetAPI.getStatus();
        setServerStatus('online');
      } catch (error) {
        setServerStatus('offline');
      }
    };
    
    checkServerStatus();
  }, []);

  // Показываем компонент даже если нет датасетов, чтобы показать статус сервера
  const shouldShow = savedDatasets.length > 0 || serverStatus === 'offline';

  if (!shouldShow) {
    return null;
  }

  const formatDate = (dateString: string) => {
    // Отображаем строго по ISO без TZ-сдвига
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [y, m, d] = dateString.split('-');
      return `${d}.${m}.${y}`;
    }
    return new Date(dateString).toISOString().slice(0, 10).split('-').reverse().join('.');
  };

  const handleLoadDataset = async (datasetId: string) => {
    try {
      setLoadingId(datasetId);
      await loadDatasetsFromServer();
      await loadDatasetFromServer(datasetId);
      // гарантируем наличие стратегии
      try {
        if (!currentStrategy) {
          const tpl = STRATEGY_TEMPLATES[0];
          const strat = createStrategyFromTemplate(tpl);
          setStrategy(strat);
        }
      } catch {}
      // снимаем лоадер сразу
      setLoadingId(null);
      // мгновенно переходим на «Результаты» и фиксируем hash
      try { window.location.hash = '#results'; } catch {}
      if (onAfterLoad) onAfterLoad();
      // запускаем бэктест в фоне, не блокируя UI
      try { runBacktest?.(); } catch {}
    } catch (e) {
      console.warn('Failed to load dataset', e);
    }
  };

  const handleDeleteDataset = (datasetId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setConfirmTarget(datasetId);
    setConfirmOpen(true);
  };

  const handleExportDataset = (datasetId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    exportDatasetAsJSON(datasetId);
  };

  return (
    <div className="bg-white rounded-lg border p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">
            Dataset Library ({savedDatasets.length})
          </h3>
          
          {/* Server Status */}
          <div className="flex items-center gap-1">
            {serverStatus === 'online' ? (
              <>
                <Server className="w-4 h-4 text-green-600" />
                <span className="text-xs text-green-600">Server Online</span>
              </>
            ) : serverStatus === 'offline' ? (
              <>
                <ServerOff className="w-4 h-4 text-red-600" />
                <span className="text-xs text-red-600">Server Offline</span>
              </>
            ) : (
              <span className="text-xs text-gray-500">Checking...</span>
            )}
          </div>
          
          {currentDataset && (
            <span className="text-sm text-gray-500">
              • Current: {currentDataset.name}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
        >
          {isExpanded ? (
            <>
              <EyeOff className="w-4 h-4" />
              Hide
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              Show
            </>
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-2">
          {serverStatus === 'offline' && savedDatasets.length === 0 && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <ServerOff className="w-5 h-5 text-yellow-600" />
                <span className="font-medium text-yellow-800">Server Not Running</span>
              </div>
              <p className="text-sm text-yellow-700 mb-2">
                To save and load datasets, please start the server:
              </p>
              <code className="text-xs bg-yellow-100 px-2 py-1 rounded">
                cd server && npm install && npm run dev
              </code>
            </div>
          )}
          
          {savedDatasets.map((dataset) => (
            <DatasetCard
              key={dataset.name}
              dataset={dataset}
              isActive={currentDataset?.name === dataset.name}
              onLoad={() => handleLoadDataset(dataset.name)}
              onDelete={(e) => handleDeleteDataset(dataset.name, e)}
              onExport={(e) => handleExportDataset(dataset.name, e)}
              loading={loadingId === dataset.name}
            />
          ))}
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Удалить датасет?"
        message={confirmTarget ? `Будет удалён файл датасета "${confirmTarget}" без возможности восстановления.` : ''}
        confirmText="Удалить"
        cancelText="Отмена"
        onConfirm={async () => {
          if (confirmTarget) {
            await deleteDatasetFromServer(confirmTarget);
          }
          setConfirmOpen(false);
          setConfirmTarget(null);
        }}
        onClose={() => { setConfirmOpen(false); setConfirmTarget(null); }}
      />
    </div>
  );
}

interface DatasetCardProps {
  dataset: SavedDataset;
  isActive: boolean;
  onLoad: () => void;
  onDelete: (event: React.MouseEvent) => void;
  onExport: (event: React.MouseEvent) => void;
  loading?: boolean;
}

function DatasetCard({ dataset, isActive, onLoad, onDelete, onExport, loading }: DatasetCardProps) {
  const formatDate = (dateString: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [y, m, d] = dateString.split('-');
      return `${d}.${m}.${y}`;
    }
    return new Date(dateString).toISOString().slice(0, 10).split('-').reverse().join('.');
  };

  return (
    <div
      onClick={loading ? undefined : onLoad}
      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
        isActive 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-gray-900">{dataset.name}</span>
            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded font-mono">
              {dataset.ticker}
            </span>
            {loading && (
              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">Loading…</span>
            )}
            {isActive && (
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                Active
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <BarChart3 className="w-4 h-4" />
              {dataset.dataPoints.toLocaleString()} points
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatDate(dataset.dateRange.from)} - {formatDate(dataset.dateRange.to)}
            </div>
          </div>
          
          <div className="text-xs text-gray-500 mt-1">
            Saved: {formatDate(dataset.uploadDate)}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={onExport}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="Export as JSON"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Delete dataset"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}