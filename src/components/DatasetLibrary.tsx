import React, { useState, useEffect } from 'react';
import { Database, Download, Trash2, Calendar, ServerOff, RefreshCw, Edit } from 'lucide-react';
import { useAppStore } from '../stores';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { DatasetAPI } from '../lib/api';
import type { SavedDataset } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { useNavigate } from 'react-router-dom';

export function DatasetLibrary({ onAfterLoad }: { onAfterLoad?: () => void } = {}) {
  const navigate = useNavigate();
  const savedDatasets = useAppStore(s => s.savedDatasets);
  const currentDataset = useAppStore(s => s.currentDataset);
  const currentStrategy = useAppStore(s => s.currentStrategy);
  const setStrategy = useAppStore(s => s.setStrategy);
  const loadDatasetFromServer = useAppStore(s => s.loadDatasetFromServer);
  const deleteDatasetFromServer = useAppStore(s => s.deleteDatasetFromServer);
  const exportDatasetAsJSON = useAppStore(s => s.exportDatasetAsJSON);
  const loadDatasetsFromServer = useAppStore(s => s.loadDatasetsFromServer);
  const resultsRefreshProvider = useAppStore(s => s.resultsRefreshProvider);
  const runBacktest = useAppStore(s => s.runBacktest);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Состояние для фильтра по тегам
  const [selectedTag, setSelectedTag] = useState<string>('top');

  // Получаем все уникальные теги из датасетов
  const allTags = React.useMemo(() => {
    const tags = new Set<string>();
    savedDatasets.forEach(dataset => {
      if (dataset.tag) {
        // Разбиваем теги по запятой и добавляем каждый тег отдельно
        dataset.tag.split(',').forEach(tag => {
          const trimmedTag = tag.trim();
          if (trimmedTag) {
            tags.add(trimmedTag);
          }
        });
      }
    });
    return Array.from(tags).sort();
  }, [savedDatasets]);

  // Фильтруем датасеты по выбранному тегу
  const filteredDatasets = React.useMemo(() => {
    if (selectedTag === 'all') {
      return savedDatasets;
    }
    return savedDatasets.filter(dataset => {
      if (!dataset.tag) return false;
      // Проверяем, содержит ли список тегов выбранный тег
      return dataset.tag.split(',').some(tag => tag.trim() === selectedTag);
    });
  }, [savedDatasets, selectedTag]);

  // Состояние для модального окна редактирования
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingDataset, setEditingDataset] = useState<Omit<SavedDataset, 'data'> | null>(null);
  const [editTag, setEditTag] = useState('');
  const [editCompanyName, setEditCompanyName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Check server status on mount - auth is already verified by ProtectedLayout
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        await DatasetAPI.getStatus();
        setServerStatus('online');
      } catch {
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

  // локальное форматирование дат находится в компоненте DatasetCard

  const handleLoadDataset = async (datasetId: string) => {
    try {
      setLoadingId(datasetId);
      await loadDatasetsFromServer();
      await loadDatasetFromServer(datasetId);
      // гарантируем наличие стратегии
      if (!currentStrategy) {
        try {
          const tpl = STRATEGY_TEMPLATES[0];
          const strat = createStrategyFromTemplate(tpl);
          setStrategy(strat);
        } catch (e) {
          console.warn('Failed to ensure default strategy', e);
        }
      }
      // снимаем лоадер сразу
      setLoadingId(null);
      // мгновенно переходим на «Результаты» через роутер
      try { navigate('/results'); } catch { /* ignore */ }
      if (onAfterLoad) onAfterLoad();
      // запускаем бэктест в фоне, не блокируя UI
      try { runBacktest?.(); } catch (e) { console.warn('Failed to start backtest', e); }
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

  const handleEditDataset = (dataset: Omit<SavedDataset, 'data'>, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingDataset(dataset);
    setEditTag(dataset.tag || '');
    setEditCompanyName(dataset.companyName || '');
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingDataset) return;

    try {
      setSavingEdit(true);
      const datasetId = ((editingDataset as unknown as { id?: string }).id || editingDataset.ticker || editingDataset.name).toString();

      // Обновляем метаданные датасета
      await DatasetAPI.updateDatasetMetadata(datasetId, {
        tag: editTag.trim(),
        companyName: editCompanyName.trim()
      });

      // Перезагружаем список датасетов
      await loadDatasetsFromServer();

      setEditModalOpen(false);
      setEditingDataset(null);
      setEditTag('');
      setEditCompanyName('');
    } catch (error) {
      console.error('Failed to update dataset metadata:', error);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4 mb-6 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100">
      {/* Header Section - Mobile-First Design */}
      <div className="space-y-3 mb-4">
        {/* Row 1: Title with Icon */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 bg-blue-50 rounded-lg dark:bg-blue-950/20">
            <Database className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
              Библиотека датасетов
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {filteredDatasets.length}{selectedTag !== 'all' ? ` из ${savedDatasets.length}` : ''} датасетов
            </p>
          </div>
        </div>

        {/* Row 2: Status and Current Dataset */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Server Status */}
            <div className="flex items-center gap-1.5">
              {serverStatus === 'online' ? (
                <>
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">Online</span>
                </>
              ) : serverStatus === 'offline' ? (
                <>
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span className="text-xs text-red-600 dark:text-red-400 font-medium">Offline</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Проверяем…</span>
                </>
              )}
            </div>

            {/* Current Dataset */}
            {currentDataset && (
              <div className="flex items-center gap-1">
                <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  Активный: <span className="font-medium text-gray-900 dark:text-gray-100">{currentDataset.name}</span>
                </span>
              </div>
            )}
          </div>

        </div>

        {/* Row 3: Filter Buttons - Mobile Responsive */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Фильтр
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTag('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${selectedTag === 'all'
                ? 'bg-blue-100 text-blue-800 border-2 border-blue-200 shadow-sm dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900/40'
                : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700'
                }`}
            >
              Все ({savedDatasets.length})
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${selectedTag === tag
                  ? 'bg-blue-100 text-blue-800 border-2 border-blue-200 shadow-sm dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900/40'
                  : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700'
                  }`}
              >
                {tag} ({savedDatasets.filter(d => d.tag && d.tag.split(',').some(t => t.trim() === tag)).length})
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {serverStatus === 'offline' && savedDatasets.length === 0 && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <ServerOff className="w-5 h-5 text-yellow-600" />
              <span className="font-medium text-yellow-800">Сервер не запущен</span>
            </div>
            <p className="text-sm text-yellow-700 mb-2">
              Чтобы сохранять и загружать датасеты, запустите сервер:
            </p>
            <code className="text-xs bg-yellow-100 px-2 py-1 rounded">
              cd server && npm install && npm run dev
            </code>
          </div>
        )}

        {serverStatus !== 'offline' && savedDatasets.length > 0 && filteredDatasets.length === 0 && selectedTag !== 'all' && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-blue-800">Нет датасетов с тегом "{selectedTag}"</span>
            </div>
            <p className="text-sm text-blue-700">
              Выберите другой фильтр или нажмите "Все" чтобы увидеть все датасеты.
            </p>
          </div>
        )}

        {filteredDatasets.map((dataset: Omit<SavedDataset, 'data'>) => (
          <DatasetCard
            key={dataset.name}
            dataset={dataset}
            isActive={currentDataset?.ticker === dataset.ticker}
            onLoad={() => handleLoadDataset(((dataset as unknown as { id?: string }).id || dataset.ticker || dataset.name).toString())}
            onDelete={(e) => handleDeleteDataset(((dataset as unknown as { id?: string }).id || dataset.ticker || dataset.name).toString(), e)}
            onExport={(e) => handleExportDataset(((dataset as unknown as { id?: string }).id || dataset.ticker || dataset.name).toString(), e)}
            loading={loadingId === dataset.name}
            onEdit={(e) => handleEditDataset(dataset, e)}
            onRefresh={async (e) => {
              e.stopPropagation();
              // Единый ID = тикер в верхнем регистре
              const id = (dataset.ticker || (dataset as unknown as { id?: string }).id || dataset.name).toString().toUpperCase();
              try {
                setRefreshingId(id);
                await DatasetAPI.refreshDataset(id, resultsRefreshProvider as any);
                await loadDatasetsFromServer();
              } catch (err) {
                console.warn('Refresh failed', err);
              } finally {
                setRefreshingId(null);
              }
            }}
            refreshing={refreshingId === ((dataset.ticker || (dataset as unknown as { id?: string }).id || dataset.name).toString().toUpperCase())}
          />
        ))}
      </div>

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

      {/* Модальное окно редактирования датасета */}
      {editModalOpen && editingDataset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Редактировать датасет
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Тикер
                </label>
                <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100">
                  {editingDataset.ticker}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Теги
                </label>
                <input
                  type="text"
                  value={editTag}
                  onChange={(e) => setEditTag(e.target.value)}
                  placeholder="Например: tech, growth, dividend (через запятую)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Название компании
                </label>
                <input
                  type="text"
                  value={editCompanyName}
                  onChange={(e) => setEditCompanyName(e.target.value)}
                  placeholder="Например: Apple Inc."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                disabled={savingEdit}
              >
                Отмена
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingEdit ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface DatasetCardProps {
  dataset: Omit<SavedDataset, 'data'>;
  isActive: boolean;
  onLoad: () => void;
  onDelete: (event: React.MouseEvent) => void;
  onExport: (event: React.MouseEvent) => void;
  onEdit?: (event: React.MouseEvent) => void;
  loading?: boolean;
  onRefresh?: (event: React.MouseEvent) => void;
  refreshing?: boolean;
}

function DatasetCard({ dataset, isActive, onLoad, onDelete, onExport, onEdit, onRefresh, loading, refreshing }: DatasetCardProps) {
  const formatDate = (dateString: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [y, m, d] = dateString.split('-');
      return `${d}.${m}.${y}`;
    }
    return new Date(dateString).toISOString().slice(0, 10).split('-').reverse().join('.');
  };
  const label = dataset.companyName || dataset.ticker;

  return (
    <div
      onClick={loading ? undefined : onLoad}
      className={`p-3 rounded-lg border cursor-pointer transition-colors ${isActive
        ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30'
        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:bg-gray-900 dark:hover:bg-gray-800'
        }`}
    >
      <div className="space-y-3">
        {/* Основной контент */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-gray-900 dark:text-gray-100">{label}</span>
            {dataset.companyName && (
              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded font-mono dark:bg-blue-950/30 dark:text-blue-200 dark:border dark:border-blue-900/40">
                {dataset.ticker}
              </span>
            )}
            {dataset.tag && (
              <div className="flex flex-wrap gap-1">
                {dataset.tag.split(',').map((tag, index) => {
                  const trimmedTag = tag.trim();
                  if (!trimmedTag) return null;
                  return (
                    <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded dark:bg-blue-950/30 dark:text-blue-200 dark:border dark:border-blue-900/40">
                      {trimmedTag}
                    </span>
                  );
                })}
              </div>
            )}
            {loading && (
              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded dark:bg-gray-800 dark:text-gray-200 dark:border dark:border-gray-700">Загрузка…</span>
            )}
            {isActive && (
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded dark:bg-emerald-950/30 dark:text-emerald-200 dark:border dark:border-emerald-900/40">
                Выбран
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatDate(dataset.dateRange.from)} - {formatDate(dataset.dateRange.to)}
            </div>
          </div>

          <div className="text-xs text-gray-500 mt-1 dark:text-gray-400">
            Сохранён: {formatDate(dataset.uploadDate)}
          </div>
        </div>

        {/* Блок кнопок - на всю ширину на мобильных, компактный на десктопе */}
        <div className="flex items-center justify-between">
          {/* Пустое пространство для выравнивания на десктопе */}
          <div className="hidden md:block"></div>

          {/* Кнопки - занимают всю ширину на мобильных */}
          <div className="flex items-center gap-1 w-full md:w-auto md:gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-2 text-gray-400 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-transparent rounded transition-colors flex-1 md:flex-none"
                title="Редактировать датасет"
                aria-label="Редактировать датасет"
              >
                <Edit className="w-4 h-4 mx-auto" />
              </button>
            )}
            <button
              onClick={onRefresh}
              className="p-2 text-gray-400 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-transparent rounded transition-colors flex-1 md:flex-none"
              title="Обновить датасет"
              aria-label="Обновить датасет"
            >
              <RefreshCw className={`w-4 h-4 mx-auto ${refreshing ? 'animate-spin origin-center' : ''}`} />
            </button>
            <button
              onClick={onExport}
              className="p-2 text-gray-400 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-transparent rounded transition-colors flex-1 md:flex-none"
              title="Экспорт JSON"
            >
              <Download className="w-4 h-4 mx-auto transition-colors group-hover:text-blue-600" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-gray-400 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-transparent rounded transition-colors flex-1 md:flex-none"
              title="Удалить датасет"
            >
              <Trash2 className="w-4 h-4 mx-auto transition-colors group-hover:text-red-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}