import React, { useEffect, useState } from 'react';
import { DatasetAPI } from '../lib/api';
import { useAppStore } from '../stores';
import { sanitizeNumericInput, sanitizeTextInput, VALIDATION_CONSTRAINTS } from '../lib/input-validation';
import { BarChart3, TrendingUp, ShoppingCart, TrendingDown, Target, Calculator, Clock, AlertTriangle, PiggyBank, DollarSign, BarChart2, Layers } from 'lucide-react';
// import { StrategySettings } from './StrategySettings';

// SettingsData interface removed - not actively used

export function AppSettings() {
  const loadSettingsFromServer = useAppStore(s => s.loadSettingsFromServer);
  const saveSettingsToServer = useAppStore(s => s.saveSettingsToServer);
  const resultsQuoteProvider = useAppStore(s => s.resultsQuoteProvider);
  const resultsRefreshProvider = useAppStore(s => s.resultsRefreshProvider);
  const enhancerProvider = useAppStore(s => s.enhancerProvider);
  const setResultsQuoteProvider = useAppStore(s => s.setResultsQuoteProvider);
  const setResultsRefreshProvider = useAppStore(s => s.setResultsRefreshProvider);
  const setEnhancerProvider = useAppStore(s => s.setEnhancerProvider);
  const watchThresholdPct = useAppStore(s => s.watchThresholdPct);
  const setWatchThresholdPct = useAppStore(s => s.setWatchThresholdPct);
  const indicatorPanePercent = useAppStore(s => s.indicatorPanePercent);
  const setIndicatorPanePercent = useAppStore(s => s.setIndicatorPanePercent);
  const commissionType = useAppStore(s => s.commissionType);
  const commissionFixed = useAppStore(s => s.commissionFixed);
  const commissionPercentage = useAppStore(s => s.commissionPercentage);
  const setCommissionType = useAppStore(s => s.setCommissionType);
  const setCommissionFixed = useAppStore(s => s.setCommissionFixed);
  const setCommissionPercentage = useAppStore(s => s.setCommissionPercentage);
  const analysisTabsConfig = useAppStore(s => s.analysisTabsConfig);
  const setAnalysisTabsConfig = useAppStore(s => s.setAnalysisTabsConfig);

  // Active tab state
  const [activeTab, setActiveTab] = useState<'general' | 'api' | 'telegram' | 'interface'>('general');

  useEffect(() => { loadSettingsFromServer(); }, [loadSettingsFromServer]);

  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState('Тестовое сообщение ✅');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // API Settings state
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaveOk, setSettingsSaveOk] = useState<string | null>(null);
  const [settingsSaveErr, setSettingsSaveErr] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settings, setSettings] = useState<any>({});

  // API key inputs (unmasked for editing)
  const [alphaVantageKey, setAlphaVantageKey] = useState('');
  const [finnhubKey, setFinnhubKey] = useState('');
  const [twelveDataKey, setTwelveDataKey] = useState('');
  const [polygonKey, setPolygonKey] = useState('');

  // Telegram settings state
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');

  // Иконки для табов
  const getTabIcon = (tabId: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      price: <BarChart3 className="w-4 h-4" />,
      equity: <TrendingUp className="w-4 h-4" />,
      buyhold: <ShoppingCart className="w-4 h-4" />,
      drawdown: <TrendingDown className="w-4 h-4" />,
      trades: <Target className="w-4 h-4" />,
      profit: <Calculator className="w-4 h-4" />,
      duration: <Clock className="w-4 h-4" />,
      openDayDrawdown: <AlertTriangle className="w-4 h-4" />,
      margin: <PiggyBank className="w-4 h-4" />,
      singlePosition: <DollarSign className="w-4 h-4" />,
      splits: <Layers className="w-4 h-4" />
    };
    return iconMap[tabId] || <BarChart2 className="w-4 h-4" />;
  };

  // Drag & Drop состояние
  const [draggedTab, setDraggedTab] = useState<string | null>(null);

  // Функции для управления табами аналитики
  const toggleTabVisibility = (tabId: string) => {
    const newConfig = analysisTabsConfig.map(tab => 
      tab.id === tabId ? { ...tab, visible: !tab.visible } : tab
    );
    setAnalysisTabsConfig(newConfig);
  };

  // Drag & Drop функции
  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTab(tabId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', tabId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    
    if (!draggedTab || draggedTab === targetTabId) return;
    
    const draggedIndex = analysisTabsConfig.findIndex(tab => tab.id === draggedTab);
    const targetIndex = analysisTabsConfig.findIndex(tab => tab.id === targetTabId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    const newConfig = [...analysisTabsConfig];
    const [draggedItem] = newConfig.splice(draggedIndex, 1);
    newConfig.splice(targetIndex, 0, draggedItem);
    
    setAnalysisTabsConfig(newConfig);
    setDraggedTab(null);
  };

  const handleDragEnd = () => {
    setDraggedTab(null);
  };

  const saveInterfaceSettings = async () => {
    // Настройки табов теперь сохраняются автоматически в localStorage
    setSaveOk('Настройки интерфейса сохранены в браузере');
    // Автоматически сбрасываем сообщение через 3 секунды
    setTimeout(() => setSaveOk(null), 3000);
  };

  const sendTest = async () => {
    setSending(true); setError(null); setOk(null);
    try {
      await DatasetAPI.sendTelegramTest(testMsg);
      setOk('Отправлено');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось отправить';
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const saveProviders = async () => {
    setSaving(true); setSaveOk(null); setSaveErr(null);
    try {
      await saveSettingsToServer();
      setSaveOk('Сохранено');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось сохранить';
      setSaveErr(message);
    } finally {
      setSaving(false);
    }
  };

  // Load API settings from server
  const loadApiSettings = async () => {
    setSettingsLoading(true);
    try {
      const data = await DatasetAPI.getSettings();
      setSettings(data);

      // Set form values (unmask the keys for editing)
      if (data.api) {
        setAlphaVantageKey(sanitizeTextInput(data.api.alphaVantageKey || '', { maxLength: 100, removeHtml: true }));
        setFinnhubKey(sanitizeTextInput(data.api.finnhubKey || '', { maxLength: 100, removeHtml: true }));
        setTwelveDataKey(sanitizeTextInput(data.api.twelveDataKey || '', { maxLength: 100, removeHtml: true }));
        setPolygonKey(sanitizeTextInput(data.api.polygonKey || '', { maxLength: 100, removeHtml: true }));
      }

      // Set Telegram settings (don't load masked values)
      if (data.telegram) {
        // If the botToken contains asterisks, it means it's masked - leave empty
        const botToken = data.telegram.botToken || '';
        const chatId = data.telegram.chatId || '';
        setTelegramBotToken(botToken.includes('*') ? '' : sanitizeTextInput(botToken, { maxLength: 200, removeHtml: true }));
        setTelegramChatId(sanitizeTextInput(chatId, { maxLength: 50, removeHtml: true }));
      }
    } catch (e) {
      console.error('Failed to load API settings:', e);
    } finally {
      setSettingsLoading(false);
    }
  };

  // Save API settings to server
  const saveApiSettings = async () => {
    setSettingsSaving(true);
    setSettingsSaveOk(null);
    setSettingsSaveErr(null);
    try {
      const updates = {
        api: {
          alphaVantageKey: alphaVantageKey.trim() || undefined,
          finnhubKey: finnhubKey.trim() || undefined,
          twelveDataKey: twelveDataKey.trim() || undefined,
          polygonKey: polygonKey.trim() || undefined,
        }
      };
      await DatasetAPI.updateSettings(updates);
      setSettingsSaveOk('API настройки сохранены');
      // Reload settings to show updated masked values
      await loadApiSettings();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось сохранить API настройки';
      setSettingsSaveErr(message);
    } finally {
      setSettingsSaving(false);
    }
  };

  // Save Telegram settings to server
  const saveTelegramSettings = async () => {
    setSettingsSaving(true);
    setSettingsSaveOk(null);
    setSettingsSaveErr(null);
    try {
      const updates = {
        telegram: {
          botToken: telegramBotToken.trim() || undefined,
          chatId: telegramChatId.trim() || undefined,
        }
      };
      await DatasetAPI.updateSettings(updates);
      setSettingsSaveOk('Telegram настройки сохранены');
      // Reload settings
      await loadApiSettings();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось сохранить Telegram настройки';
      setSettingsSaveErr(message);
    } finally {
      setSettingsSaving(false);
    }
  };

  // Load API settings on component mount
  useEffect(() => {
    loadApiSettings();
  }, []);

  // General Settings Tab
  const GeneralTab = () => (
    <div className="space-y-4">
      {/* Уведомления */}
      <div className="p-4 rounded-lg border">
        <div className="text-sm font-medium text-gray-700 mb-2">Уведомления</div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Порог близости к IBS, %</label>
        <p className="text-xs text-gray-500 mb-2">Диапазон 0–20%. По умолчанию 5%.</p>
        <div className="flex items-center gap-4">
          <input type="range" min={0} max={20} step={0.5} value={watchThresholdPct} onChange={(e)=> {
            const sanitized = sanitizeNumericInput(e.target.value, {
              ...VALIDATION_CONSTRAINTS.thresholdPct,
              max: 20,
              fallback: watchThresholdPct
            });
            setWatchThresholdPct(sanitized);
          }} className="flex-1" />
          <input type="number" min={0} max={20} step={0.5} value={watchThresholdPct} onChange={(e)=> {
            const sanitized = sanitizeNumericInput(e.target.value, {
              ...VALIDATION_CONSTRAINTS.thresholdPct,
              max: 20,
              fallback: watchThresholdPct
            });
            setWatchThresholdPct(sanitized);
          }} className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <span className="text-sm text-gray-500">%</span>
        </div>
      </div>

      {/* График */}
      <div className="p-4 rounded-lg border">
        <div className="text-sm font-medium text-gray-700 mb-2">График</div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Высота панели индикаторов (IBS/Объём), %</label>
        <p className="text-xs text-gray-500 mb-2">Диапазон 0–40%. По умолчанию 7%. Больше — выше панель, меньше — ниже.</p>
        <div className="flex items-center gap-4">
          <input type="range" min={0} max={40} step={1} value={indicatorPanePercent} onChange={(e)=> {
            const sanitized = sanitizeNumericInput(e.target.value, {
              ...VALIDATION_CONSTRAINTS.indicatorPane,
              max: 40,
              fallback: indicatorPanePercent
            });
            setIndicatorPanePercent(sanitized);
          }} className="flex-1" />
          <input type="number" min={0} max={40} step={1} value={indicatorPanePercent} onChange={(e)=> {
            const sanitized = sanitizeNumericInput(e.target.value, {
              ...VALIDATION_CONSTRAINTS.indicatorPane,
              max: 40,
              fallback: indicatorPanePercent
            });
            setIndicatorPanePercent(sanitized);
          }} className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <span className="text-sm text-gray-500">%</span>
        </div>
        <div className="text-xs text-gray-500 mt-1">Подсказка: чтобы сделать столбики заметно ниже (примерно в 3 раза), установите ~7%.</div>
      </div>

      {/* Комиссии */}
      <div className="p-4 rounded-lg border">
        <div className="text-sm font-medium text-gray-700 mb-3">Комиссии торговли</div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Тип комиссии</label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input 
                  type="radio" 
                  name="commissionType" 
                  checked={commissionType === 'fixed'} 
                  onChange={() => setCommissionType('fixed')} 
                />
                Фиксированная
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input 
                  type="radio" 
                  name="commissionType" 
                  checked={commissionType === 'percentage'} 
                  onChange={() => setCommissionType('percentage')} 
                />
                Процентная
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input 
                  type="radio" 
                  name="commissionType" 
                  checked={commissionType === 'combined'} 
                  onChange={() => setCommissionType('combined')} 
                />
                Комбинированная
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={commissionType === 'percentage' ? 'opacity-50' : ''}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Фиксированная комиссия, $
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={commissionFixed}
                onChange={(e) => {
                  const sanitized = sanitizeNumericInput(e.target.value, {
                    ...VALIDATION_CONSTRAINTS.commission.fixed,
                    fallback: commissionFixed
                  });
                  setCommissionFixed(sanitized);
                }}
                disabled={commissionType === 'percentage'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              />
              <p className="text-xs text-gray-500 mt-1">За каждую сделку (вход + выход)</p>
            </div>
            
            <div className={commissionType === 'fixed' ? 'opacity-50' : ''}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Процентная комиссия, %
              </label>
              <input
                type="number"
                min="0"
                max="10"
                step="0.01"
                value={commissionPercentage}
                onChange={(e) => {
                  const sanitized = sanitizeNumericInput(e.target.value, {
                    ...VALIDATION_CONSTRAINTS.commission.percentage,
                    fallback: commissionPercentage
                  });
                  setCommissionPercentage(sanitized);
                }}
                disabled={commissionType === 'fixed'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              />
              <p className="text-xs text-gray-500 mt-1">От суммы сделки (например, 0.1%)</p>
            </div>
          </div>
          
          <div className="text-xs text-gray-500 p-3 bg-blue-50 rounded-md">
            💡 <strong>Типы комиссий:</strong><br/>
            • <strong>Фиксированная:</strong> одинаковая сумма за каждую сделку<br/>
            • <strong>Процентная:</strong> процент от суммы сделки<br/>
            • <strong>Комбинированная:</strong> фиксированная часть + процент
          </div>
        </div>
      </div>

      {/* Провайдеры данных */}
      <div className="p-4 rounded-lg border">
        <div className="text-sm font-medium text-gray-700 mb-3">Провайдеры данных</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded p-3 border">
            <div className="text-xs text-gray-500 mb-2">Котировки (страница «Результаты»)</div>
            <label className="flex items-center gap-2 text-sm mb-1">
              <input type="radio" name="quoteProvider" checked={resultsQuoteProvider === 'finnhub'} onChange={() => setResultsQuoteProvider('finnhub')} />
              Finnhub
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="quoteProvider" checked={resultsQuoteProvider === 'alpha_vantage'} onChange={() => setResultsQuoteProvider('alpha_vantage')} />
              Alpha Vantage
            </label>
          </div>

          <div className="bg-gray-50 rounded p-3 border">
            <div className="text-xs text-gray-500 mb-2">Актуализация датасета (серверный refresh)</div>
            <label className="flex items-center gap-2 text-sm mb-1">
              <input type="radio" name="refreshProvider" checked={resultsRefreshProvider === 'finnhub'} onChange={() => setResultsRefreshProvider('finnhub')} />
              Finnhub
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="refreshProvider" checked={resultsRefreshProvider === 'alpha_vantage'} onChange={() => setResultsRefreshProvider('alpha_vantage')} />
              Alpha Vantage
            </label>
          </div>

          <div className="bg-gray-50 rounded p-3 border">
            <div className="text-xs text-gray-500 mb-2">Импорт «Новые данные» (энхансер)</div>
            <label className="flex items-center gap-2 text-sm mb-1">
              <input type="radio" name="enhancerProvider" checked={enhancerProvider === 'alpha_vantage'} onChange={() => setEnhancerProvider('alpha_vantage')} />
              Alpha Vantage
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="enhancerProvider" checked={enhancerProvider === 'finnhub'} onChange={() => setEnhancerProvider('finnhub')} />
              Finnhub
            </label>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={saveProviders} disabled={saving} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-gray-400">
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          {saveOk && <span className="text-sm text-green-600">{saveOk}</span>}
          {saveErr && <span className="text-sm text-red-600">{saveErr}</span>}
        </div>
        <div className="text-xs text-gray-500 mt-2">Подсказка: для refresh используйте провайдера, который стабильно доступен на вашем тарифе.</div>
      </div>
    </div>
  );

  // API Settings Tab
  const ApiTab = () => (
    <div className="space-y-4">
      {/* API Keys Settings */}
      <div className="p-4 rounded-lg border">
        <div className="text-sm font-medium text-gray-700 mb-3">API ключи</div>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Alpha Vantage API Key</label>
              <input
                type="password"
                value={alphaVantageKey}
                onChange={(e) => {
                  const sanitized = sanitizeTextInput(e.target.value, {
                    maxLength: 100,
                    removeHtml: true,
                    allowedChars: /[a-zA-Z0-9_-]/
                  });
                  setAlphaVantageKey(sanitized);
                }}
                placeholder="Ваш API ключ Alpha Vantage"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Finnhub API Key</label>
              <input
                type="password"
                value={finnhubKey}
                onChange={(e) => {
                  const sanitized = sanitizeTextInput(e.target.value, {
                    maxLength: 100,
                    removeHtml: true,
                    allowedChars: /[a-zA-Z0-9_-]/
                  });
                  setFinnhubKey(sanitized);
                }}
                placeholder="Ваш API ключ Finnhub"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Twelve Data API Key</label>
              <input
                type="password"
                value={twelveDataKey}
                onChange={(e) => setTwelveDataKey(e.target.value)}
                placeholder="Ваш API ключ Twelve Data"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Polygon API Key</label>
              <input
                type="password"
                value={polygonKey}
                onChange={(e) => setPolygonKey(e.target.value)}
                placeholder="Ваш API ключ Polygon"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={saveApiSettings}
              disabled={settingsSaving}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:bg-gray-400"
            >
              {settingsSaving ? 'Сохранение…' : 'Сохранить API ключи'}
            </button>
            {settingsSaveOk && <span className="text-sm text-green-600">{settingsSaveOk}</span>}
            {settingsSaveErr && <span className="text-sm text-red-600">{settingsSaveErr}</span>}
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          💡 API ключи хранятся в зашифрованном виде на сервере. Для получения ключей зарегистрируйтесь на соответствующих сервисах.
        </div>
      </div>
    </div>
  );

  // Interface Settings Tab
  const InterfaceTab = () => (
    <div className="space-y-6">
      {/* Управление табами аналитики */}
      <div className="p-6 rounded-lg border">
        <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Управление табами "Аналитика сделок"</div>
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Перетаскивайте блоки для изменения порядка. Нажмите на блок, чтобы скрыть/показать вкладку.
        </div>
        
        {/* Draggable blocks */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {analysisTabsConfig.map((tab) => (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, tab.id)}
              onDragEnd={handleDragEnd}
              onClick={() => toggleTabVisibility(tab.id)}
              className={`
                relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200
                ${tab.visible 
                  ? 'bg-white border-blue-200 shadow-sm hover:shadow-md hover:border-blue-300' 
                  : 'bg-gray-100 border-gray-300 opacity-60 hover:opacity-80'
                }
                ${draggedTab === tab.id ? 'rotate-3 scale-105 shadow-lg z-10' : ''}
                hover:scale-105 active:scale-95
              `}
              title={`${tab.visible ? 'Нажмите, чтобы скрыть' : 'Нажмите, чтобы показать'} • Перетаскивайте для изменения порядка`}
            >
              {/* Drag handle */}
              <div className="absolute top-2 right-2 text-gray-400 text-xs">
                ⋮⋮
              </div>
              
              {/* Icon and label */}
              <div className="flex flex-col items-center text-center space-y-2">
                <div className={`
                  p-3 rounded-full transition-colors
                  ${tab.visible 
                    ? 'bg-blue-100 text-blue-600' 
                    : 'bg-gray-200 text-gray-500'
                  }
                `}>
                  {getTabIcon(tab.id)}
                </div>
                
                <div className={`
                  text-sm font-medium leading-tight
                  ${tab.visible 
                    ? 'text-gray-900' 
                    : 'text-gray-500 line-through'
                  }
                `}>
                  {tab.label}
                </div>
              </div>
              
              {/* Status indicator */}
              <div className={`
                absolute bottom-2 left-2 w-2 h-2 rounded-full
                ${tab.visible ? 'bg-green-400' : 'bg-red-400'}
              `} />
            </div>
          ))}
        </div>

        {/* Statistics */}
        <div className="mt-6 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <div>
            Видимые вкладки: <span className="font-medium text-green-600">
              {analysisTabsConfig.filter(tab => tab.visible).length}
            </span> из {analysisTabsConfig.length}
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-400"></div>
              Показана
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-400"></div>
              Скрыта
            </div>
          </div>
        </div>
      </div>
      
      {/* Предварительный просмотр */}
      <div className="p-4 rounded-lg border bg-gray-50 dark:bg-gray-800">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Предварительный просмотр</div>
        <div className="text-xs text-gray-500 mb-3">Так будут выглядеть вкладки в разделе "Аналитика сделок":</div>
        
        <div className="flex flex-wrap gap-2">
          {analysisTabsConfig
            .filter(tab => tab.visible)
            .map((tab, index) => (
              <div key={tab.id} className="flex items-center gap-2">
                <button className="flex items-center gap-2 px-3 py-1.5 rounded border bg-white border-gray-200 text-gray-700 text-sm">
                  {getTabIcon(tab.id)}
                  {tab.label}
                </button>
                {index < analysisTabsConfig.filter(tab => tab.visible).length - 1 && (
                  <span className="text-gray-300">•</span>
                )}
              </div>
            ))}
        </div>
        
        {analysisTabsConfig.filter(tab => tab.visible).length === 0 && (
          <div className="text-gray-500 text-sm italic">Нет видимых вкладок</div>
        )}
      </div>
    </div>
  );

  // Telegram Settings Tab
  const TelegramTab = () => (
    <div className="space-y-4">
      {/* Telegram Settings */}
      <div className="p-4 rounded-lg border">
        <div className="text-sm font-medium text-gray-700 mb-3">Telegram настройки</div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Bot Token</label>
            <input
              type="password"
              value={telegramBotToken}
              onChange={(e) => {
                const sanitized = sanitizeTextInput(e.target.value, {
                  maxLength: 200,
                  removeHtml: true,
                  allowedChars: /[a-zA-Z0-9:_-]/
                });
                setTelegramBotToken(sanitized);
              }}
              placeholder="Ваш Telegram Bot Token"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Создайте бота через @BotFather и получите токен. Поле пустое для безопасности.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Chat ID</label>
            <input
              type="text"
              value={telegramChatId}
              onChange={(e) => {
                const sanitized = sanitizeTextInput(e.target.value, {
                  maxLength: 50,
                  removeHtml: true,
                  allowedChars: /[0-9-]/
                });
                setTelegramChatId(sanitized);
              }}
              placeholder="Ваш Chat ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Добавьте бота в чат и получите Chat ID через @userinfobot
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={saveTelegramSettings}
              disabled={settingsSaving}
              className="px-4 py-2 rounded-md bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:bg-gray-400"
            >
              {settingsSaving ? 'Сохранение…' : 'Сохранить Telegram настройки'}
            </button>
            {settingsSaveOk && <span className="text-sm text-green-600">{settingsSaveOk}</span>}
            {settingsSaveErr && <span className="text-sm text-red-600">{settingsSaveErr}</span>}
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          🔒 Telegram токены хранятся в зашифрованном виде на сервере.
        </div>
      </div>

      <div className="p-4 rounded-lg border bg-gray-50">
        <div className="text-sm font-medium text-gray-700 mb-2">Тестовое сообщение в Telegram</div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={testMsg} onChange={(e)=> {
            const sanitized = sanitizeTextInput(e.target.value, {
              maxLength: 500,
              removeHtml: true
            });
            setTestMsg(sanitized);
          }} className="flex-1 min-w-[260px] px-3 py-2 rounded-md border" />
          <button onClick={sendTest} disabled={sending} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-gray-400">
            {sending ? 'Отправка…' : 'Отправить тест'}
          </button>
        </div>
        {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
        {ok && <div className="text-sm text-green-600 mt-2">{ok}</div>}
      </div>
      <p className="text-xs text-gray-500">Примечание: Telegram-бот и чат должны быть настроены на сервере.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Настройки</h2>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('general')}
            className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'general'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Общие
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'api'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            API
          </button>
          <button
            onClick={() => setActiveTab('telegram')}
            className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'telegram'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Telegram
          </button>
          <button
            onClick={() => setActiveTab('interface')}
            className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'interface'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Интерфейс
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'api' && <ApiTab />}
        {activeTab === 'telegram' && <TelegramTab />}
        {activeTab === 'interface' && <InterfaceTab />}
      </div>
    </div>
  );
}



