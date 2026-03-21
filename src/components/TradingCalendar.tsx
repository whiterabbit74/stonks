import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Clock, AlertCircle, CalendarX2, ChevronLeft, ChevronRight, X, CalendarOff, RefreshCw, Download, CheckCircle2, Pencil } from 'lucide-react';
import { API_BASE_URL, DatasetAPI } from '../lib/api';
import { PageHeader } from './ui/PageHeader';

interface HolidayData {
  name: string;
  type: 'holiday' | 'short';
  description: string;
  hours?: number;
}

interface CalendarData {
  metadata: {
    version: string;
    description: string;
    lastUpdated: string;
    years: string[];
    webullCoverageThrough?: string;
  };
  holidays: Record<string, Record<string, HolidayData>>;
  shortDays: Record<string, Record<string, HolidayData>>;
  weekends: {
    description: string;
  };
  tradingHours: {
    normal: { start: string; end: string; description: string };
    short: { start: string; end: string; description: string };
  };
}

type DayEditType = 'normal' | 'holiday' | 'short';

export function TradingCalendar() {
  const MONTHS = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [focusedDay, setFocusedDay] = useState<number | null>(null);
  const dayRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsDate, setDetailsDate] = useState<{ year: string; month: number; day: number } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const modalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modalCloseRef = useRef<HTMLButtonElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    from: string; to: string; coverageThrough: string;
    tradingDaysFound: number; newHolidays: number; newShortDays: number; fetchErrors: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Edit state
  const [editType, setEditType] = useState<DayEditType>('normal');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();

  const isCurrentMonth = parseInt(selectedYear) === currentYear && selectedMonth === currentMonth;

  const goToPreviousMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((parseInt(selectedYear) - 1).toString());
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((parseInt(selectedYear) + 1).toString());
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const goToToday = () => {
    setSelectedYear(currentYear.toString());
    setSelectedMonth(currentMonth);
    setFocusedDay(currentDay);
  };

  const loadCalendar = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/trading-calendar`);
      if (!response.ok) throw new Error('Failed to load calendar data');
      const data = await response.json();
      setCalendarData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  const handleImportWebull = async () => {
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const result = await DatasetAPI.importWebullCalendar();
      setImportResult(result);
      await loadCalendar();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    const daysInMonth = getDaysInMonth(parseInt(selectedYear), selectedMonth);
    setFocusedDay(prev => {
      if (prev && prev >= 1) return Math.min(prev, daysInMonth);
      if (parseInt(selectedYear) === currentYear && selectedMonth === currentMonth) {
        return Math.min(currentDay, daysInMonth);
      }
      return 1;
    });
  }, [selectedYear, selectedMonth, currentDay, currentMonth, currentYear]);

  useEffect(() => {
    if (detailsOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => { modalCloseRef.current?.focus(); });
      return () => { document.body.style.overflow = prev; };
    }
  }, [detailsOpen]);

  const getDayType = (year: string, month: number, day: number) => {
    if (!calendarData) return 'normal';
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateKey = `${monthStr}-${dayStr}`;
    if (calendarData.holidays[year]?.[dateKey]) return 'holiday';
    if (calendarData.shortDays[year]?.[dateKey]) return 'short';
    const date = new Date(parseInt(year), month, day);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    if (dayName === 'saturday' || dayName === 'sunday') return 'weekend';
    return 'normal';
  };

  const getDayData = (year: string, month: number, day: number) => {
    if (!calendarData) return null;
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateKey = `${monthStr}-${dayStr}`;
    return calendarData.holidays[year]?.[dateKey] || calendarData.shortDays[year]?.[dateKey] || null;
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

  const getFirstDayOfMonth = (year: number, month: number) => {
    const dayOfWeek = new Date(year, month, 1).getDay();
    return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  };

  const monthHeaderId = useMemo(() => `month-label-${selectedYear}-${selectedMonth}`, [selectedYear, selectedMonth]);

  const openDetails = useCallback((year: string, month: number, day: number, triggerElement?: HTMLButtonElement | null) => {
    if (triggerElement) modalTriggerRef.current = triggerElement;
    setDetailsDate({ year, month, day });
    setDetailsOpen(true);
    setEditError(null);
    // Pre-set edit type from current day type
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateKey = `${monthStr}-${dayStr}`;
    if (calendarData?.holidays[year]?.[dateKey]) setEditType('holiday');
    else if (calendarData?.shortDays[year]?.[dateKey]) setEditType('short');
    else setEditType('normal');
  }, [calendarData]);

  const closeDetails = useCallback(() => {
    setDetailsOpen(false);
    setDetailsDate(null);
    setEditError(null);
    requestAnimationFrame(() => { modalTriggerRef.current?.focus(); });
  }, []);

  const handleSaveDay = async () => {
    if (!detailsDate) return;
    const { year, month, day } = detailsDate;
    const mmdd = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setEditSaving(true);
    setEditError(null);
    try {
      await DatasetAPI.updateCalendarDay(year, mmdd, editType);
      await loadCalendar();
      closeDetails();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setEditSaving(false);
    }
  };

  const handleGridTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleGridTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) goToPreviousMonth(); else goToNextMonth();
    }
  };

  const focusDay = (day: number) => {
    setFocusedDay(day);
    requestAnimationFrame(() => { dayRefs.current[day - 1]?.focus(); });
  };

  const handleDayKeyDown = (day: number, e: React.KeyboardEvent<HTMLButtonElement>) => {
    const year = parseInt(selectedYear);
    const daysInMonth = getDaysInMonth(year, selectedMonth);
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetails(selectedYear, selectedMonth, day); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); if (day < daysInMonth) focusDay(day + 1); else { goToNextMonth(); setTimeout(() => focusDay(1), 0); } }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (day > 1) focusDay(day - 1); else { goToPreviousMonth(); setTimeout(() => { focusDay(getDaysInMonth(year, selectedMonth === 0 ? 11 : selectedMonth - 1)); }, 0); } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (day + 7 <= daysInMonth) focusDay(day + 7); else { goToNextMonth(); setTimeout(() => focusDay((day + 7) - daysInMonth), 0); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (day - 7 >= 1) focusDay(day - 7); else { goToPreviousMonth(); setTimeout(() => { focusDay(getDaysInMonth(year, selectedMonth === 0 ? 11 : selectedMonth - 1) - (7 - day)); }, 0); } }
    else if (e.key === 'Home') { e.preventDefault(); focusDay(1); }
    else if (e.key === 'End') { e.preventDefault(); focusDay(daysInMonth); }
    else if (e.key === 'PageUp') { e.preventDefault(); goToPreviousMonth(); setTimeout(() => focusDay(Math.min(day, getDaysInMonth(year, selectedMonth === 0 ? 11 : selectedMonth - 1))), 0); }
    else if (e.key === 'PageDown') { e.preventDefault(); goToNextMonth(); setTimeout(() => focusDay(Math.min(day, getDaysInMonth(year, selectedMonth === 11 ? 0 : selectedMonth + 1))), 0); }
  };

  const renderCalendar = () => {
    const year = parseInt(selectedYear);
    const daysInMonth = getDaysInMonth(year, selectedMonth);
    const firstDayOfMonth = getFirstDayOfMonth(year, selectedMonth);
    const days = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(
        <div key={`empty-${i}`} role="gridcell" aria-hidden="true"
          className="min-h-[40px] border-r border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50" />
      );
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dayType = getDayType(selectedYear, selectedMonth, day);
      const dayData = getDayData(selectedYear, selectedMonth, day);
      const isToday = parseInt(selectedYear) === currentYear && selectedMonth === currentMonth && day === currentDay;

      let cellCls = 'bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/70';
      let numCls = 'text-gray-800 dark:text-gray-200';
      let borderCls = 'border-gray-100 dark:border-gray-800';
      let badge: React.ReactNode = null;

      if (isToday) {
        cellCls = 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600';
        numCls = 'text-white';
        borderCls = 'border-indigo-500';
      } else {
        switch (dayType) {
          case 'holiday':
            cellCls = 'bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/30';
            numCls = 'text-red-700 dark:text-red-300';
            borderCls = 'border-red-200 dark:border-red-900/50';
            badge = <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />;
            break;
          case 'short':
            cellCls = 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-950/30';
            numCls = 'text-amber-800 dark:text-amber-300';
            borderCls = 'border-amber-200 dark:border-amber-900/50';
            badge = <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />;
            break;
          case 'weekend':
            cellCls = 'bg-gray-50 dark:bg-gray-800/40';
            numCls = 'text-gray-400 dark:text-gray-500';
            break;
        }
      }

      const ariaLabel = (() => {
        const base = `${day} ${MONTHS[selectedMonth]} ${selectedYear}`;
        if (dayType === 'holiday' && dayData) return `${base} — Праздник: ${dayData.name}`;
        if (dayType === 'short' && dayData) return `${base} — Раннее закрытие`;
        if (dayType === 'weekend') return `${base} — Выходной`;
        return `${base} — Торговый день`;
      })();

      days.push(
        <button
          key={day}
          ref={(el: HTMLButtonElement | null) => { if (el) dayRefs.current[day - 1] = el; }}
          onClick={(e) => openDetails(selectedYear, selectedMonth, day, e.currentTarget)}
          onKeyDown={(e) => handleDayKeyDown(day, e)}
          onFocus={() => setFocusedDay(day)}
          role="gridcell"
          aria-selected={focusedDay === day}
          aria-label={ariaLabel}
          tabIndex={focusedDay === day ? 0 : -1}
          title={dayData ? `${dayData.name}: ${dayData.description}` : undefined}
          className={`relative min-h-[40px] border-r border-b ${borderCls} ${cellCls} ${numCls} p-1.5 text-sm flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset`}
        >
          <span className={`text-sm font-medium leading-none ${isToday ? 'text-white' : ''}`}>{day}</span>
          {badge}
        </button>
      );
    }

    return days;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="h-10 bg-gray-50 dark:bg-gray-800 animate-pulse border-b border-gray-200 dark:border-gray-700" />
          <div className="grid grid-cols-7">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="min-h-[40px] bg-gray-50 dark:bg-gray-900 animate-pulse border-r border-b border-gray-100 dark:border-gray-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Календарь торгов" subtitle="NYSE • Американский рынок акций" />
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/20 dark:border-red-900/40">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">Ошибка загрузки: {error}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!calendarData) return null;

  const holidaysThisYear = Object.entries(calendarData.holidays[selectedYear] || {});
  const shortDaysThisYear = Object.entries(calendarData.shortDays[selectedYear] || {});

  return (
    <div className="space-y-4">
      <PageHeader
        title="Календарь торгов"
        subtitle={
          calendarData.metadata?.webullCoverageThrough
            ? `NYSE · данные по ${calendarData.metadata.webullCoverageThrough}`
            : 'NYSE · Американский рынок акций'
        }
      />

      {/* Legend + import button */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
          Торговый · {calendarData.tradingHours.normal.start}–{calendarData.tradingHours.normal.end}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarOff className="w-3.5 h-3.5 flex-shrink-0" />
          Выходной (Сб, Вс)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
          Раннее закрытие · до {calendarData.tradingHours.short.end}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
          Праздник · биржа закрыта
        </span>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleImportWebull}
            disabled={importing}
            title="Импортировать данные из Webull (от последней покрытой даты на 6 месяцев вперёд)"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-50 disabled:cursor-wait transition-colors"
          >
            {importing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {importing ? 'Импорт…' : 'Импорт из Webull'}
          </button>
        </div>
      </div>

      {/* Main layout: calendar left, lists right on wide screens */}
      <div className="flex flex-col xl:flex-row gap-4">

        {/* Calendar card — constrained width on wide screens */}
        <div className="xl:w-[480px] xl:flex-shrink-0 bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
          {/* Navigation bar */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
            <button onClick={goToPreviousMonth} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Предыдущий месяц">
              <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>

            <div className="flex items-center gap-2">
              <h2 id={monthHeaderId} className="text-sm font-semibold text-gray-900 dark:text-gray-100 min-w-[120px] text-center">
                {MONTHS[selectedMonth]} {selectedYear}
              </h2>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="text-xs px-2 py-1 bg-white border border-gray-300 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 focus:ring-1 focus:ring-blue-500"
                aria-label="Год"
              >
                {calendarData.metadata.years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  setSelectedMonth(isNaN(value) ? 0 : Math.max(0, Math.min(11, value)));
                }}
                className="text-xs px-2 py-1 bg-white border border-gray-300 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 focus:ring-1 focus:ring-blue-500"
                aria-label="Месяц"
              >
                {MONTHS.map((month, index) => (
                  <option key={index} value={index}>{month}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={goToToday}
                disabled={isCurrentMonth}
                className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${isCurrentMonth ? 'text-gray-400 dark:text-gray-500 cursor-default' : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30'}`}
              >
                Сегодня
              </button>
              <button onClick={goToNextMonth} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Следующий месяц">
                <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700">
            {WEEKDAYS.map(day => (
              <div key={day} className="py-1.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 border-r border-gray-100 dark:border-gray-800 last:border-r-0">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div
            className="grid grid-cols-7 touch-manipulation"
            role="grid"
            aria-labelledby={monthHeaderId}
            onTouchStart={handleGridTouchStart}
            onTouchEnd={handleGridTouchEnd}
          >
            {renderCalendar()}
          </div>
          <div className="sr-only" aria-live="polite" aria-atomic="true">{MONTHS[selectedMonth]} {selectedYear}</div>
        </div>

        {/* Right column: holidays + short days */}
        {(holidaysThisYear.length > 0 || shortDaysThisYear.length > 0) && (
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {/* Holidays */}
            <div className="bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-red-50 dark:bg-red-950/20">
                <CalendarX2 className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-red-900 dark:text-red-200">Праздники {selectedYear}</span>
                <span className="ml-auto text-xs text-red-500 dark:text-red-400">{holidaysThisYear.length}</span>
              </div>
              {holidaysThisYear.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 px-4 py-3">Нет праздников</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {holidaysThisYear.map(([date, data]) => {
                    const [month, day] = date.split('-');
                    return (
                      <div key={date} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <span className="text-gray-800 dark:text-gray-200 truncate mr-2">{data.name}</span>
                        <span className="text-xs text-red-600 dark:text-red-400 flex-shrink-0 font-medium">
                          {parseInt(day)} {MONTHS[parseInt(month) - 1].slice(0, 3)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Short days */}
            <div className="bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-amber-50 dark:bg-amber-950/20">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">Раннее закрытие {selectedYear}</span>
                <span className="ml-auto text-xs text-amber-500 dark:text-amber-400">{shortDaysThisYear.length}</span>
              </div>
              {shortDaysThisYear.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 px-4 py-3">Нет сокращённых дней</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {shortDaysThisYear.map(([date, data]) => {
                    const [month, day] = date.split('-');
                    return (
                      <div key={date} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <span className="text-gray-800 dark:text-gray-200 truncate mr-2">{data.name}</span>
                        <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0 font-medium">
                          {parseInt(day)} {MONTHS[parseInt(month) - 1].slice(0, 3)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Day details + edit modal */}
      {detailsOpen && detailsDate && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-day-details-title"
          onKeyDown={(e) => { if (e.key === 'Escape') closeDetails(); }}
        >
          <div className="absolute inset-0 bg-black/40" onClick={closeDetails} />
          <div className="relative w-full md:max-w-sm md:rounded-xl bg-white border border-gray-200 p-4 shadow-lg dark:bg-gray-900 dark:border-gray-800 md:mx-4 rounded-t-2xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="calendar-day-details-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {detailsDate.day} {MONTHS[detailsDate.month]} {detailsDate.year}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {(() => {
                    const data = getDayData(detailsDate.year, detailsDate.month, detailsDate.day);
                    const type = getDayType(detailsDate.year, detailsDate.month, detailsDate.day);
                    if (type === 'holiday' && data) return `Праздник — ${data.name}`;
                    if (type === 'short') return `Раннее закрытие · до ${calendarData.tradingHours.short.end} EST`;
                    if (type === 'weekend') return 'Выходной · биржа закрыта';
                    return `Торговый день · ${calendarData.tradingHours.normal.start}–${calendarData.tradingHours.normal.end} EST`;
                  })()}
                </p>
              </div>
              <button
                ref={modalCloseRef}
                onClick={closeDetails}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {(() => {
              const data = getDayData(detailsDate.year, detailsDate.month, detailsDate.day);
              if (!data) return null;
              return <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{data.description}</p>;
            })()}

            {/* Edit section — only for non-weekend days */}
            {getDayType(detailsDate.year, detailsDate.month, detailsDate.day) !== 'weekend' && (
              <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <Pencil className="w-3.5 h-3.5" />
                  Изменить тип дня
                </div>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as DayEditType)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="normal">Торговый день</option>
                  <option value="short">Раннее закрытие</option>
                  <option value="holiday">Праздник (биржа закрыта)</option>
                </select>
                {editError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{editError}</p>
                )}
                <button
                  onClick={handleSaveDay}
                  disabled={editSaving}
                  className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {editSaving ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import result */}
      {(importResult !== null || importError) && (
        <div className={`rounded-xl border overflow-hidden ${importError ? 'border-red-200 dark:border-red-900/40' : 'border-emerald-200 dark:border-emerald-900/40'}`}>
          <div className={`flex items-center justify-between px-4 py-2 border-b ${importError ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40' : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40'}`}>
            <div className="flex items-center gap-2">
              {importError ? (
                <AlertCircle className="w-4 h-4 text-red-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              )}
              <span className={`text-sm font-medium ${importError ? 'text-red-800 dark:text-red-200' : 'text-emerald-800 dark:text-emerald-200'}`}>
                {importError ? 'Ошибка импорта' : 'Импорт завершён'}
              </span>
            </div>
            <button
              onClick={() => { setImportResult(null); setImportError(null); }}
              className="p-1 rounded hover:bg-white/50 dark:hover:bg-white/10"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="px-4 py-3 bg-white dark:bg-gray-900">
            {importError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{importError}</p>
            ) : importResult && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                <span>Период: <strong>{importResult.from}</strong> — <strong>{importResult.to}</strong></span>
                <span>Торговых дней: <strong>{importResult.tradingDaysFound}</strong></span>
                <span>Новых праздников: <strong className="text-red-600 dark:text-red-400">{importResult.newHolidays}</strong></span>
                <span>Коротких дней: <strong className="text-amber-600 dark:text-amber-400">{importResult.newShortDays}</strong></span>
                {importResult.fetchErrors > 0 && (
                  <span className="text-orange-600 dark:text-orange-400">Ошибок чанков: {importResult.fetchErrors}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
