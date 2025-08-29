import React, { useEffect, useState, useMemo } from 'react';
import { Calendar, Clock, AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Info, TrendingUp } from 'lucide-react';
import { API_BASE_URL } from '../lib/api';

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

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

// Фиксированный порядок дней недели, начиная с понедельника
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function TradingCalendar() {
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

  // Получаем текущую дату для выделения
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();

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
    const date = new Date(year, month, day);
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

  const renderCalendar = () => {
    const year = parseInt(selectedYear);
    const daysInMonth = getDaysInMonth(year, selectedMonth);
    const firstDayOfMonth = getFirstDayOfMonth(year, selectedMonth);

    const days = [];

    // Пустые ячейки для дней до начала месяца
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-10"></div>);
    }

    // Дни месяца
    for (let day = 1; day <= daysInMonth; day++) {
      const dayType = getDayType(selectedYear, selectedMonth, day);
      const dayData = getDayData(selectedYear, selectedMonth, day);

      // Определяем стили для разных типов дней
      let bgColor = 'bg-white hover:bg-gray-50';
      let textColor = 'text-gray-900';
      let borderColor = 'border-gray-200';
      let shadow = '';
      let emoji = '';
      let isToday = false;

      // Проверяем, является ли этот день сегодняшним
      if (parseInt(selectedYear) === currentYear &&
          selectedMonth === currentMonth &&
          day === currentDay) {
        isToday = true;
        bgColor = 'bg-blue-600 text-white hover:bg-blue-700';
        textColor = 'text-white';
        borderColor = 'border-blue-600';
        shadow = 'shadow-lg ring-2 ring-blue-300';
      } else {
        switch (dayType) {
          case 'holiday':
            bgColor = 'bg-gradient-to-br from-red-50 to-rose-50 hover:from-red-100 hover:to-rose-100';
            textColor = 'text-red-900';
            borderColor = 'border-red-300';
            emoji = '🏖️';
            shadow = 'hover:shadow-md';
            break;
          case 'short':
            bgColor = 'bg-gradient-to-br from-yellow-50 to-amber-50 hover:from-yellow-100 hover:to-amber-100';
            textColor = 'text-yellow-900';
            borderColor = 'border-yellow-300';
            emoji = '⏰';
            shadow = 'hover:shadow-md';
            break;
          case 'weekend':
            bgColor = 'bg-gradient-to-br from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200';
            textColor = 'text-gray-600';
            borderColor = 'border-gray-300';
            shadow = 'hover:shadow-sm';
            break;
          default:
            shadow = 'hover:shadow-sm';
        }
      }

      days.push(
        <div
          key={day}
          className={`min-h-[80px] border-r border-b ${borderColor} ${bgColor} ${textColor} ${shadow} p-3 text-sm flex flex-col items-center justify-center cursor-pointer transition-all duration-200 transform hover:scale-105 relative overflow-hidden`}
          title={dayData ? `${dayData.name}: ${dayData.description}` : undefined}
        >
          {/* Фон для сегодняшнего дня */}
          {isToday && (
            <div className="absolute inset-0 bg-blue-600 opacity-10 rounded"></div>
          )}

          {/* Номер дня */}
          <span className={`font-bold text-lg mb-1 relative z-10 ${isToday ? 'text-white' : ''}`}>
            {day}
          </span>

          {/* Эмодзи или индикатор типа дня */}
          {dayData && (
            <div className={`text-lg mb-1 relative z-10 ${dayType === 'holiday' ? 'animate-pulse' : ''}`}>
              {emoji}
            </div>
          )}

          {/* Название праздника (если есть) */}
          {dayData && (
            <div className={`text-xs font-medium text-center leading-tight max-w-full truncate relative z-10 ${isToday ? 'text-blue-100' : ''}`}>
              {dayData.name.length > 10 ? dayData.name.substring(0, 8) + '...' : dayData.name}
            </div>
          )}

          {/* Сегодняшний день индикатор */}
          {isToday && (
            <div className="absolute bottom-1 right-1 w-2 h-2 bg-white rounded-full shadow-sm"></div>
          )}
        </div>
      );
    }

    return days;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">Загрузка календаря...</div>
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
      {/* Заголовок с градиентом */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <Calendar className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Календарь торгов</h1>
              <p className="text-blue-100 mt-1">NYSE • Американский рынок акций</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm">
            <TrendingUp className="w-4 h-4" />
            <span>Реальное время</span>
          </div>
        </div>
      </div>

      {/* Улучшенная легенда */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Info className="w-5 h-5 text-gray-600" />
            Легенда календаря
          </h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl hover:shadow-md transition-shadow">
              <div className="w-5 h-5 bg-green-500 rounded-full shadow-sm"></div>
              <div>
                <div className="font-medium text-green-900">Торговый день</div>
                <div className="text-xs text-green-700">9:30-16:00 EST</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-300 rounded-xl hover:shadow-md transition-shadow">
              <div className="w-5 h-5 bg-gray-400 rounded-full shadow-sm"></div>
              <div>
                <div className="font-medium text-gray-900">Выходной</div>
                <div className="text-xs text-gray-600">Сб, Вс</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-300 rounded-xl hover:shadow-md transition-shadow">
              <Clock className="w-5 h-5 text-yellow-600" />
              <div>
                <div className="font-medium text-yellow-900">Раннее закрытие</div>
                <div className="text-xs text-yellow-700">до 13:00 EST</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-red-50 to-rose-50 border border-red-300 rounded-xl hover:shadow-md transition-shadow">
              <CheckCircle className="w-5 h-5 text-red-600" />
              <div>
                <div className="font-medium text-red-900">Праздник</div>
                <div className="text-xs text-red-700">Биржа закрыта</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Часы работы с улучшенным дизайном */}
      <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border border-blue-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Clock className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">Часы работы NYSE</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="font-medium text-gray-900">Обычные часы</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {calendarData.tradingHours.normal.start} - {calendarData.tradingHours.normal.end}
                </div>
                <div className="text-sm text-gray-600 mt-1">EST/EDT (Восточное время)</div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-yellow-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="font-medium text-gray-900">Раннее закрытие</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  до {calendarData.tradingHours.short.end}
                </div>
                <div className="text-sm text-gray-600 mt-1">В праздничные дни</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Навигация календаря */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
          {/* Управление месяцем/годом */}
          <div className="flex items-center gap-4">
            <button
              onClick={goToPreviousMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Предыдущий месяц"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>

            <div className="flex gap-3">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors"
              >
                {calendarData.metadata.years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>

              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors"
              >
                {MONTHS.map((month, index) => (
                  <option key={index} value={index}>{month}</option>
                ))}
              </select>
            </div>

            <button
              onClick={goToNextMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Следующий месяц"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Кнопка "Сегодня" и информация */}
          <div className="flex items-center gap-4">
            <button
              onClick={goToToday}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
            >
              Сегодня
            </button>

            <div className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
              Данные на: <span className="font-medium text-gray-900">{calendarData.metadata.lastUpdated}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Календарь с современным дизайном */}
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        {/* Заголовок месяца с градиентом */}
        <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 px-8 py-6 text-white">
          <h2 className="text-2xl font-bold text-center">
            {MONTHS[selectedMonth]} {selectedYear}
          </h2>
          <p className="text-gray-300 text-center mt-1 text-sm">
            NYSE Trading Calendar
          </p>
        </div>

        {/* Дни недели */}
        <div className="grid grid-cols-7 bg-gray-50">
          {WEEKDAYS.map(day => (
            <div key={day} className="px-4 py-4 text-center text-sm font-semibold text-gray-700 border-r border-gray-200 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Дни месяца */}
        <div className="grid grid-cols-7 bg-white">
          {renderCalendar()}
        </div>
      </div>

      {/* Современные карточки праздников */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Федеральные праздники */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Федеральные праздники</h3>
                <p className="text-red-100 text-sm">Биржа закрыта</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid gap-3">
              {Object.entries(calendarData.holidays[selectedYear] || {}).map(([date, data]) => (
                <div key={date} className="group bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-4 hover:shadow-lg transition-all duration-200 hover:scale-[1.02]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center group-hover:bg-red-200 transition-colors">
                        <span className="text-red-600 font-bold">🏖️</span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-red-900 group-hover:text-red-800">{data.name}</h4>
                        <p className="text-sm text-red-600">{data.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="bg-red-600 text-white px-3 py-1 rounded-lg font-medium text-sm">
                        {date}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Дни с ранним закрытием */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-yellow-500 to-amber-600 px-6 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Раннее закрытие</h3>
                <p className="text-yellow-100 text-sm">Сокращенный день</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid gap-3">
              {Object.entries(calendarData.shortDays[selectedYear] || {}).map(([date, data]) => (
                <div key={date} className="group bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-4 hover:shadow-lg transition-all duration-200 hover:scale-[1.02]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center group-hover:bg-yellow-200 transition-colors">
                        <span className="text-yellow-600 font-bold">⏰</span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-yellow-900 group-hover:text-yellow-800">{data.name}</h4>
                        <p className="text-sm text-yellow-600">Работает {data.hours} часов</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="bg-yellow-600 text-white px-3 py-1 rounded-lg font-medium text-sm">
                        {date}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
