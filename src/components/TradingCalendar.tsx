import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Clock, AlertCircle, CalendarX2, ChevronLeft, ChevronRight, Info, TrendingUp, X, CalendarOff } from 'lucide-react';
import { API_BASE_URL } from '../lib/api';
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

export function TradingCalendar() {
  const MONTHS = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  // Фиксированный порядок дней недели, начиная с понедельника
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

  // Получаем текущую дату для выделения
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();

  // Check if current view is today's month
  // Moved AFTER currentYear/currentMonth definitions to avoid TDZ error
  const isCurrentMonth = parseInt(selectedYear) === currentYear && selectedMonth === currentMonth;

  // Функции навигации
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

  useEffect(() => {
    const loadCalendar = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/trading-calendar`);
        if (!response.ok) {
          throw new Error('Failed to load calendar data');
        }
        const data = await response.json();
        setCalendarData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load calendar');
      } finally {
        setLoading(false);
      }
    };

    loadCalendar();
  }, []);

  // Focused day management across month changes
  useEffect(() => {
    const daysInMonth = getDaysInMonth(parseInt(selectedYear), selectedMonth);
    // Prefer to keep current focusedDay if set, otherwise default to today or 1st
    setFocusedDay(prev => {
      if (prev && prev >= 1) {
        return Math.min(prev, daysInMonth);
      }
      if (
        parseInt(selectedYear) === currentYear &&
        selectedMonth === currentMonth
      ) {
        return Math.min(currentDay, daysInMonth);
      }
      return 1;
    });
  }, [selectedYear, selectedMonth, currentDay, currentMonth, currentYear]);

  useEffect(() => {
    if (detailsOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      // Focus the close button when modal opens
      requestAnimationFrame(() => {
        modalCloseRef.current?.focus();
      });
      return () => { document.body.style.overflow = prev; };
    }
  }, [detailsOpen]);

  const getDayType = (year: string, month: number, day: number) => {
    if (!calendarData) return 'normal';

    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateKey = `${monthStr}-${dayStr}`;

    // Проверяем праздники
    if (calendarData.holidays[year]?.[dateKey]) {
      return 'holiday';
    }

    // Проверяем сокращенные дни
    if (calendarData.shortDays[year]?.[dateKey]) {
      return 'short';
    }

    // Проверяем выходные (независимо от локали)
    const date = new Date(parseInt(year), month, day);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    if (dayName === 'saturday' || dayName === 'sunday') {
      return 'weekend';
    }

    return 'normal';
  };

  const getDayData = (year: string, month: number, day: number) => {
    if (!calendarData) return null;

    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateKey = `${monthStr}-${dayStr}`;

    return calendarData.holidays[year]?.[dateKey] ||
      calendarData.shortDays[year]?.[dateKey] ||
      null;
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const dayOfWeek = firstDay.getDay(); // 0 = воскресенье, 1 = понедельник, etc.

    // Преобразуем в наш порядок (понедельник = 0, вторник = 1, ..., воскресенье = 6)
    const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    return adjustedDay;
  };

  const monthHeaderId = useMemo(() => `month-label-${selectedYear}-${selectedMonth}`, [selectedYear, selectedMonth]);

  const openDetails = useCallback((year: string, month: number, day: number, triggerElement?: HTMLButtonElement | null) => {
    if (triggerElement) {
      modalTriggerRef.current = triggerElement;
    }
    setDetailsDate({ year, month, day });
    setDetailsOpen(true);
  }, []);

  const closeDetails = useCallback(() => {
    setDetailsOpen(false);
    setDetailsDate(null);
    // Return focus to trigger element
    requestAnimationFrame(() => {
      modalTriggerRef.current?.focus();
    });
  }, []);

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
      if (dx > 0) {
        goToPreviousMonth();
      } else {
        goToNextMonth();
      }
    }
  };

  const focusDay = (day: number) => {
    setFocusedDay(day);
    // Focus after render
    requestAnimationFrame(() => {
      dayRefs.current[day - 1]?.focus();
    });
  };

  const handleDayKeyDown = (day: number, e: React.KeyboardEvent<HTMLButtonElement>) => {
    const year = parseInt(selectedYear);
    const daysInMonth = getDaysInMonth(year, selectedMonth);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDetails(selectedYear, selectedMonth, day);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (day < daysInMonth) {
        focusDay(day + 1);
      } else {
        goToNextMonth();
        setTimeout(() => focusDay(1), 0);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (day > 1) {
        focusDay(day - 1);
      } else {
        goToPreviousMonth();
        setTimeout(() => {
          const prevDays = getDaysInMonth(year, selectedMonth === 0 ? 11 : selectedMonth - 1);
          focusDay(prevDays);
        }, 0);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (day + 7 <= daysInMonth) {
        focusDay(day + 7);
      } else {
        goToNextMonth();
        setTimeout(() => focusDay(((day + 7) - daysInMonth)), 0);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (day - 7 >= 1) {
        focusDay(day - 7);
      } else {
        goToPreviousMonth();
        setTimeout(() => {
          const prevDays = getDaysInMonth(year, selectedMonth === 0 ? 11 : selectedMonth - 1);
          focusDay(prevDays - (7 - day));
        }, 0);
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusDay(1);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusDay(daysInMonth);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      goToPreviousMonth();
      setTimeout(() => focusDay(Math.min(day, getDaysInMonth(year, selectedMonth === 0 ? 11 : selectedMonth - 1))), 0);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      goToNextMonth();
      setTimeout(() => focusDay(Math.min(day, getDaysInMonth(year, selectedMonth === 11 ? 0 : selectedMonth + 1))), 0);
    }
  };

  const renderCalendar = () => {
    const year = parseInt(selectedYear);
    const daysInMonth = getDaysInMonth(year, selectedMonth);
    const firstDayOfMonth = getFirstDayOfMonth(year, selectedMonth);

    const days = [];

    // Пустые ячейки для дней до начала месяца
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(
        <div
          key={`empty-${i}`}
          role="gridcell"
          aria-hidden="true"
          className="min-h-[60px] md:min-h-[96px] border-r border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        ></div>
      );
    }

    // Дни месяца
    for (let day = 1; day <= daysInMonth; day++) {
      const dayType = getDayType(selectedYear, selectedMonth, day);
      const dayData = getDayData(selectedYear, selectedMonth, day);

      // Определяем стили для разных типов дней
      let bgColor = 'bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800';
      let textColor = 'text-gray-900 dark:text-gray-100';
      let borderColor = 'border-gray-200 dark:border-gray-700';
      let shadow = '';
      let emoji = '';
      let isToday = false;

      // Проверяем, является ли этот день сегодняшним
      if (parseInt(selectedYear) === currentYear &&
        selectedMonth === currentMonth &&
        day === currentDay) {
        isToday = true;
        bgColor = 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600';
        textColor = 'text-white';
        borderColor = 'border-indigo-600 dark:border-indigo-700';
        shadow = 'shadow-lg ring-2 ring-indigo-300 dark:ring-indigo-500';
      } else {
        switch (dayType) {
          case 'holiday':
            bgColor = 'bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/30';
            textColor = 'text-red-900 dark:text-red-200';
            borderColor = 'border-red-300 dark:border-red-800';
            emoji = '🏖️';
            shadow = 'hover:shadow-md';
            break;
          case 'short':
            bgColor = 'bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-950/20 dark:hover:bg-yellow-950/30';
            textColor = 'text-yellow-900 dark:text-yellow-200';
            borderColor = 'border-yellow-300 dark:border-yellow-800';
            emoji = '⏰';
            shadow = 'hover:shadow-md';
            break;
          case 'weekend':
            bgColor = 'bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700';
            textColor = 'text-gray-600 dark:text-gray-400';
            borderColor = 'border-gray-300 dark:border-gray-600';
            shadow = 'hover:shadow-sm';
            break;
          default:
            shadow = 'hover:shadow-sm';
        }
      }

      const ariaLabel = (() => {
        const monthName = MONTHS[selectedMonth];
        const base = `${day} ${monthName} ${selectedYear}`;
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
          className={`min-h-[60px] md:min-h-[96px] border-r border-b ${borderColor} ${bgColor} ${textColor} ${shadow} p-3 text-sm flex flex-col items-center justify-center transition-all duration-200 transform hover:scale-[1.02] relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1`}
          title={dayData ? `${dayData.name}: ${dayData.description}` : undefined}
        >
          {isToday && (
            <div className="absolute inset-0 bg-indigo-600 opacity-10 rounded"></div>
          )}
          <span className={`font-bold text-lg mb-1 relative z-10 ${isToday ? 'text-white' : ''}`}>
            {day}
          </span>
          {dayData && (
            <div className="text-lg mb-1 relative z-10">
              {emoji}
            </div>
          )}
          {dayData && (
            <div className={`text-xs font-medium text-center leading-tight max-w-full truncate relative z-10 ${isToday ? 'text-indigo-100' : ''}`}>
              {dayData.name.length > 15 ? dayData.name.substring(0, 12) + '...' : dayData.name}
            </div>
          )}
          {isToday && (
            <div className="absolute bottom-1 right-1 w-2 h-2 bg-white rounded-full shadow-sm"></div>
          )}
        </button>
      );
    }

    return days;
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Skeleton header */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 dark:bg-gray-900 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
            <div className="space-y-2">
              <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
              <div className="h-4 w-32 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
        {/* Skeleton calendar */}
        <div className="bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
            <div className="h-6 w-40 mx-auto bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="min-h-[60px] md:min-h-[96px] bg-white dark:bg-gray-900 animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center gap-2 text-red-800">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">Ошибка загрузки календаря</span>
        </div>
        <p className="text-red-600 mt-1">{error}</p>
      </div>
    );
  }

  if (!calendarData) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="text-gray-600">Данные календаря недоступны</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <PageHeader
        title="Календарь торгов"
        subtitle="NYSE • Американский рынок акций"
        actions={
          <div className="hidden md:flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <TrendingUp className="w-4 h-4" />
            <span>Актуальные данные</span>
          </div>
        }
      />

      {/* Легенда календаря */}
      <div className="bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 dark:text-gray-100">
            <Info className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            Легенда календаря
          </h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg dark:bg-gray-800 dark:border-gray-700">
              <div className="w-4 h-4 bg-green-500 rounded-full"></div>
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Торговый день</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">9:30-16:00 EST</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg dark:bg-gray-800 dark:border-gray-700">
              <CalendarOff className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Выходной</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Сб, Вс</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg dark:bg-gray-800 dark:border-gray-700">
              <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Раннее закрытие</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">до 13:00 EST</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg dark:bg-gray-800 dark:border-gray-700">
              <CalendarX2 className="w-5 h-5 text-red-600 dark:text-red-500" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Праздник</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Биржа закрыта</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Часы работы */}
      <div className="bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800 p-6">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-950/30">
            <Clock className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 dark:text-gray-100">Часы работы NYSE</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg dark:bg-gray-800 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Обычные часы</span>
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {calendarData.tradingHours.normal.start} - {calendarData.tradingHours.normal.end}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">EST/EDT (Восточное время)</div>
              </div>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg dark:bg-gray-800 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Раннее закрытие</span>
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  до {calendarData.tradingHours.short.end}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">В праздничные дни</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Навигация календаря */}
      <div className="bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800 p-6">
        <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
          {/* Управление месяцем/годом */}
          <div className="flex items-center gap-4">
            <button
              onClick={goToPreviousMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-gray-800"
              title="Предыдущий месяц"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>

            <div className="flex gap-3">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
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
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                aria-label="Месяц"
              >
                {MONTHS.map((month, index) => (
                  <option key={index} value={index}>{month}</option>
                ))}
              </select>
            </div>

            <button
              onClick={goToNextMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-gray-800"
              title="Следующий месяц"
            >
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          {/* Кнопка "Сегодня" и информация */}
          <div className="flex items-center gap-4">
            <button
              onClick={goToToday}
              disabled={isCurrentMonth}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${isCurrentMonth
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
            >
              Сегодня
            </button>

            <div className="text-sm text-gray-500 dark:text-gray-400">
              Данные на: <span className="font-medium text-gray-900 dark:text-gray-100">{calendarData.metadata.lastUpdated}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Календарь */}
      <div className="bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
        {/* Заголовок месяца */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
          <h2 id={monthHeaderId} className="text-xl font-bold text-center text-gray-900 dark:text-gray-100">
            {MONTHS[selectedMonth]} {selectedYear}
          </h2>
          <p className="text-gray-600 text-center mt-1 text-sm dark:text-gray-400">
            Торговый календарь NYSE
          </p>
          <div className="sr-only" aria-live="polite" aria-atomic="true">{MONTHS[selectedMonth]} {selectedYear}</div>
        </div>

        {/* Дни недели */}
        <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800">
          {WEEKDAYS.map(day => (
            <div key={day} className="px-4 py-3 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Дни месяца */}
        <div
          className="grid grid-cols-7 bg-white dark:bg-gray-900 touch-manipulation"
          role="grid"
          aria-labelledby={monthHeaderId}
          onTouchStart={handleGridTouchStart}
          onTouchEnd={handleGridTouchEnd}
        >
          {renderCalendar()}
        </div>
      </div>

      {/* Карточки праздников */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Федеральные праздники */}
        <div className="bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-red-50 dark:bg-red-950/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg dark:bg-red-950/30">
                <CalendarX2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-200">Федеральные праздники</h3>
                <p className="text-red-600 dark:text-red-400 text-sm">Биржа закрыта</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid gap-3">
              {Object.keys(calendarData.holidays[selectedYear] || {}).length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <CalendarX2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Нет праздников в {selectedYear} году</p>
                </div>
              ) : (
                Object.entries(calendarData.holidays[selectedYear] || {}).map(([date, data]) => {
                  const [month, day] = date.split('-');
                  const monthName = MONTHS[parseInt(month) - 1];
                  const formattedDate = `${parseInt(day)} ${monthName}`;
                  return (
                    <div key={date} className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition-colors dark:bg-gray-800 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center dark:bg-red-950/30">
                            <span className="text-red-600 text-sm dark:text-red-400">🏖️</span>
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">{data.name}</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{data.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="bg-red-600 text-white px-3 py-1 rounded-lg font-medium text-sm">
                            {formattedDate}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Дни с ранним закрытием */}
        <div className="bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-yellow-50 dark:bg-yellow-950/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg dark:bg-yellow-950/30">
                <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-200">Раннее закрытие</h3>
                <p className="text-yellow-600 dark:text-yellow-400 text-sm">Сокращенный день</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid gap-3">
              {Object.keys(calendarData.shortDays[selectedYear] || {}).length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Нет сокращённых дней в {selectedYear} году</p>
                </div>
              ) : (
                Object.entries(calendarData.shortDays[selectedYear] || {}).map(([date, data]) => {
                  const [month, day] = date.split('-');
                  const monthName = MONTHS[parseInt(month) - 1];
                  const formattedDate = `${parseInt(day)} ${monthName}`;
                  return (
                    <div key={date} className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition-colors dark:bg-gray-800 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center dark:bg-yellow-950/30">
                            <span className="text-yellow-600 text-sm dark:text-yellow-400">⏰</span>
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">{data.name}</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Работает {data.hours} часов</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="bg-yellow-600 text-white px-3 py-1 rounded-lg font-medium text-sm">
                            {formattedDate}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Details modal/sheet */}
      {detailsOpen && detailsDate && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-day-details-title"
          onKeyDown={(e) => { if (e.key === 'Escape') closeDetails(); }}
        >
          <div className="absolute inset-0 bg-black/40" onClick={closeDetails}></div>
          <div className="relative w-full md:max-w-lg md:rounded-xl bg-white border border-gray-200 p-4 md:p-6 shadow-lg dark:bg-gray-900 dark:border-gray-800 md:mx-4 rounded-t-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="calendar-day-details-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {(() => {
                    const d = detailsDate;
                    return `${d.day} ${MONTHS[d.month]} ${d.year}`;
                  })()}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {(() => {
                    const data = getDayData(detailsDate.year, detailsDate.month, detailsDate.day);
                    const type = getDayType(detailsDate.year, detailsDate.month, detailsDate.day);
                    if (type === 'holiday' && data) return `Праздник — ${data.name}. ${data.description}`;
                    if (type === 'short' && data) return `Сокращённый день. Открыто до ${calendarData.tradingHours.short.end}`;
                    if (type === 'weekend') return 'Выходной день. Биржа закрыта';
                    return `Обычные часы: ${calendarData.tradingHours.normal.start}–${calendarData.tradingHours.normal.end} (EST)`;
                  })()}
                </p>
              </div>
              <button
                ref={modalCloseRef}
                onClick={closeDetails}
                className="inline-flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
            {/* Show hours only for trading days */}
            {(() => {
              const type = getDayType(detailsDate.year, detailsDate.month, detailsDate.day);
              if (type === 'weekend' || type === 'holiday') return null;
              return (
                <div className="mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Обычные часы</div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{calendarData.tradingHours.normal.start} – {calendarData.tradingHours.normal.end}</div>
                    </div>
                    {type === 'short' && (
                      <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800">
                        <div className="text-xs text-yellow-600 dark:text-yellow-400">Сокращённый день</div>
                        <div className="font-medium text-yellow-900 dark:text-yellow-200">до {calendarData.tradingHours.short.end}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="mt-6 flex justify-end">
              <button onClick={closeDetails} className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
