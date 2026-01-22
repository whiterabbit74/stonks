import React, { useState, useEffect } from 'react';
import { Database, Download, Trash2, Calendar, ServerOff, RefreshCw, Edit, List, LayoutGrid, Plus, MoreVertical } from 'lucide-react';
import { useAppStore } from '../stores';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { DatasetAPI } from '../lib/api';
import type { SavedDataset } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { useNavigate, Link } from 'react-router-dom';
import { getTickerInfo } from '../lib/ticker-data';

// Utility function to get consistent dataset ID
function getDatasetId(dataset: Omit<SavedDataset, 'data'>): string {
  return ((dataset as unknown as { id?: string }).id || dataset.ticker || dataset.name).toString();
}

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

  // Состояние для вида отображения (list = полный, compact = сетка)
  const [viewMode, setViewMode] = useState<'list' | 'compact'>('compact');

  // Состояние для фильтра по тегам
  const [selectedTag, setSelectedTag] = useState<string>('all');

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

  // Check server status on mount with timeout
  useEffect(() => {
    const checkServerStatus = async () => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );
      try {
        await Promise.race([DatasetAPI.getStatus(), timeout]);
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
      if (onAfterLoad) onAfterLoad();
      setLoadingId(null);
    } catch (e) {
      console.warn('Failed to handle dataset load', e);
      setLoadingId(null);
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

          {/* View Toggle */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'list'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              title="Список"
              aria-label="Переключить на режим списка"
              aria-pressed={viewMode === 'list'}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('compact')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'compact'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              title="Компактный вид"
              aria-label="Переключить на компактный вид"
              aria-pressed={viewMode === 'compact'}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
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
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-950/20 dark:border-blue-900/40">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="font-medium text-blue-800 dark:text-blue-200">Нет датасетов с тегом "{selectedTag}"</span>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Выберите другой фильтр или нажмите "Все" чтобы увидеть все датасеты.
            </p>
          </div>
        )}

        {/* Empty State */}
        {serverStatus === 'online' && savedDatasets.length === 0 && (
          <div className="p-8 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <Database className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              Нет загруженных датасетов
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Загрузите данные тикера через API или импортируйте JSON файл
            </p>
            <button
              onClick={() => navigate('/settings')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Загрузить данные
            </button>
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && filteredDatasets.map((dataset: Omit<SavedDataset, 'data'>) => (
          <DatasetCard
            key={dataset.name}
            dataset={dataset}
            isActive={currentDataset?.ticker === dataset.ticker}
            onLoad={() => handleLoadDataset(getDatasetId(dataset))}
            onDelete={(e) => handleDeleteDataset(getDatasetId(dataset), e)}
            onExport={(e) => handleExportDataset(getDatasetId(dataset), e)}
            loading={loadingId === dataset.name}
            onEdit={(e) => handleEditDataset(dataset, e)}
            onRefresh={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const id = getDatasetId(dataset).toUpperCase();
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
            refreshing={refreshingId === getDatasetId(dataset).toUpperCase()}
          />
        ))}

        {/* Compact Grid View */}
        {viewMode === 'compact' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {filteredDatasets.map((dataset: Omit<SavedDataset, 'data'>) => (
              <CompactDatasetCard
                key={dataset.name}
                dataset={dataset}
                isActive={currentDataset?.ticker === dataset.ticker}
                onLoad={() => handleLoadDataset(getDatasetId(dataset))}
                onDelete={(e) => handleDeleteDataset(getDatasetId(dataset), e)}
                onExport={(e) => handleExportDataset(getDatasetId(dataset), e)}
                onEdit={(e) => handleEditDataset(dataset, e)}
                onRefresh={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const id = getDatasetId(dataset).toUpperCase();
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
                refreshing={refreshingId === getDatasetId(dataset).toUpperCase()}
                loading={loadingId === dataset.name}
              />
            ))}
          </div>
        )}
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
      <Modal
        isOpen={editModalOpen && !!editingDataset}
        onClose={() => setEditModalOpen(false)}
        title="Редактировать датасет"
        size="md"
      >
        {editingDataset && (
          <>
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

            <ModalFooter>
              <Button
                variant="secondary"
                onClick={() => setEditModalOpen(false)}
                disabled={savingEdit}
              >
                Отмена
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>
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

  // Get company name from dataset or look up from ticker-data
  const tickerInfo = dataset.ticker ? getTickerInfo(dataset.ticker) : undefined;
  const companyName = dataset.companyName || tickerInfo?.name;
  const label = companyName || dataset.ticker;

  return (
    <Link
      to={`/results?ticker=${dataset.ticker}`}
      onClick={(e) => {
         if (loading) {
            e.preventDefault();
         } else {
            onLoad();
         }
      }}
      className={`block p-3 rounded-lg border cursor-pointer transition-colors ${isActive
        ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30'
        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:bg-gray-900 dark:hover:bg-gray-800'
        }`}
    >
      <div className="space-y-3">
        {/* Основной контент */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-gray-900 dark:text-gray-100">{label}</span>
            {companyName && (
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
                onClick={(e) => { e.preventDefault(); onEdit(e); }}
                className="p-2 text-gray-400 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-transparent rounded transition-colors flex-1 md:flex-none"
                title="Редактировать датасет"
                aria-label="Редактировать датасет"
              >
                <Edit className="w-4 h-4 mx-auto" />
              </button>
            )}
            <button
              onClick={(e) => { e.preventDefault(); if (onRefresh) onRefresh(e); }}
              className="p-2 text-gray-400 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-transparent rounded transition-colors flex-1 md:flex-none"
              title="Обновить датасет"
              aria-label="Обновить датасет"
            >
              <RefreshCw className={`w-4 h-4 mx-auto ${refreshing ? 'animate-spin origin-center' : ''}`} />
            </button>
            <button
              onClick={(e) => { e.preventDefault(); onExport(e); }}
              className="p-2 text-gray-400 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-transparent rounded transition-colors flex-1 md:flex-none"
              title="Экспорт JSON"
            >
              <Download className="w-4 h-4 mx-auto transition-colors group-hover:text-blue-600" />
            </button>
            <button
              onClick={(e) => { e.preventDefault(); onDelete(e); }}
              className="p-2 text-gray-400 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-transparent rounded transition-colors flex-1 md:flex-none"
              title="Удалить датасет"
            >
              <Trash2 className="w-4 h-4 mx-auto transition-colors group-hover:text-red-600" />
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Compact card for grid view with context menu
interface CompactDatasetCardProps {
  dataset: Omit<SavedDataset, 'data'>;
  isActive: boolean;
  onLoad: () => void;
  onDelete: (event: React.MouseEvent) => void;
  onExport: (event: React.MouseEvent) => void;
  onEdit: (event: React.MouseEvent) => void;
  onRefresh: (event: React.MouseEvent) => void;
  refreshing?: boolean;
  loading?: boolean;
}

function CompactDatasetCard({ dataset, isActive, onLoad, onDelete, onExport, onEdit, onRefresh, refreshing, loading }: CompactDatasetCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Get company name from dataset or look up from ticker-data
  const tickerInfo = dataset.ticker ? getTickerInfo(dataset.ticker) : undefined;
  const companyName = dataset.companyName || tickerInfo?.name;

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(!menuOpen);
  };

  const handleAction = (action: (e: React.MouseEvent) => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    action(e);
  };

  return (
    <div className="relative">
      <Link
        to={`/results?ticker=${dataset.ticker}`}
        onClick={(e) => {
           if (loading) {
              e.preventDefault();
           } else {
              onLoad();
           }
        }}
        className={`block relative w-full p-3 rounded-lg border text-left transition-all duration-200 ${isActive
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 dark:border-blue-400 dark:bg-blue-950/30 dark:ring-blue-900/50'
          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 dark:border-gray-700 dark:hover:border-blue-800 dark:bg-gray-900 dark:hover:bg-blue-950/20'
          } ${loading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
      >
        {/* Active indicator */}
        {isActive && (
          <div className="absolute top-1.5 left-1.5 w-2 h-2 bg-green-500 rounded-full" />
        )}

        {/* Context menu button */}
        <button
          onClick={(e) => { e.preventDefault(); handleMenuClick(e); }}
          className="absolute top-1 right-1 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Открыть меню действий"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>

        {/* Loading indicator */}
        {(loading || refreshing) && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 rounded-lg">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          </div>
        )}

        {/* Ticker */}
        <div className="font-mono font-semibold text-sm text-gray-900 dark:text-gray-100 pr-6">
          {dataset.ticker}
        </div>

        {/* Company name (truncated) */}
        {companyName && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5" title={companyName}>
            {companyName}
          </div>
        )}

        {/* Tags indicator */}
        {dataset.tag && (
          <div className="flex items-center gap-1 mt-1.5">
            {dataset.tag.split(',').slice(0, 2).map((tag, index) => (
              <span
                key={index}
                className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded dark:bg-gray-800 dark:text-gray-400"
              >
                {tag.trim()}
              </span>
            ))}
            {dataset.tag.split(',').length > 2 && (
              <span className="text-[10px] text-gray-400">+{dataset.tag.split(',').length - 2}</span>
            )}
          </div>
        )}
      </Link>

      {/* Dropdown menu */}
      {menuOpen && (
        <>
          {/* Overlay to close menu */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 top-8 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[140px]">
            <button
              onClick={handleAction(onEdit)}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Редактировать
            </button>
            <button
              onClick={handleAction(onRefresh)}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Обновить
            </button>
            <button
              onClick={handleAction(onExport)}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Экспорт
            </button>
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            <button
              onClick={handleAction(onDelete)}
              className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Удалить
            </button>
          </div>
        </>
      )}
    </div>
  );
}