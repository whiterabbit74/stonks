import { useEffect, useState, useMemo } from 'react';
import { Calendar, Clock, AlertCircle, CheckCircle } from 'lucide-react';
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

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function TradingCalendar() {
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState('2025');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

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

    // Проверяем выходные
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) { // 0 = воскресенье, 6 = суббота
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
    return new Date(year, month, 1).getDay();
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

      let bgColor = 'bg-white hover:bg-gray-50';
      let textColor = 'text-gray-900';
      let borderColor = 'border-gray-200';

      switch (dayType) {
        case 'holiday':
          bgColor = 'bg-red-50 hover:bg-red-100';
          textColor = 'text-red-800';
          borderColor = 'border-red-200';
          break;
        case 'short':
          bgColor = 'bg-yellow-50 hover:bg-yellow-100';
          textColor = 'text-yellow-800';
          borderColor = 'border-yellow-200';
          break;
        case 'weekend':
          bgColor = 'bg-gray-50 hover:bg-gray-100';
          textColor = 'text-gray-600';
          borderColor = 'border-gray-300';
          break;
      }

      days.push(
        <div
          key={day}
          className={`h-10 border ${borderColor} ${bgColor} ${textColor} rounded p-1 text-sm flex flex-col items-center justify-center cursor-pointer transition-colors`}
          title={dayData ? `${dayData.name}: ${dayData.description}` : undefined}
        >
          <span className="font-medium">{day}</span>
          {dayData && (
            <div className="text-xs opacity-75">
              {dayType === 'holiday' && '🏖️'}
              {dayType === 'short' && '⏰'}
            </div>
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
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center gap-3">
        <Calendar className="w-6 h-6 text-indigo-600" />
        <h1 className="text-xl font-semibold text-gray-900">Торговый календарь</h1>
      </div>

      {/* Легенда */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg">
          <div className="w-4 h-4 bg-white border border-gray-300 rounded"></div>
          <span className="text-sm text-gray-700">Рабочий день</span>
        </div>
        <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-300 rounded-lg">
          <div className="w-4 h-4 bg-gray-200 rounded"></div>
          <span className="text-sm text-gray-700">Выходной</span>
        </div>
        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <Clock className="w-4 h-4 text-yellow-600" />
          <span className="text-sm text-gray-700">Сокращенный</span>
        </div>
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <CheckCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm text-gray-700">Праздник</span>
        </div>
      </div>

      {/* Информация о часах работы */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900 mb-2">Часы работы биржи</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
              <div>
                <span className="font-medium">Обычные торги:</span> {calendarData.tradingHours.normal.start} - {calendarData.tradingHours.normal.end}
              </div>
              <div>
                <span className="font-medium">Сокращенные торги:</span> {calendarData.tradingHours.short.start} - {calendarData.tradingHours.short.end}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Управление календарем */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {calendarData.metadata.years.map(year => (
              <option key={year} value={year}>{year} год</option>
            ))}
          </select>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {MONTHS.map((month, index) => (
              <option key={index} value={index}>{month}</option>
            ))}
          </select>
        </div>

        <div className="text-sm text-gray-600">
          Данные на: {calendarData.metadata.lastUpdated}
        </div>
      </div>

      {/* Календарь */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Заголовок месяца */}
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {MONTHS[selectedMonth]} {selectedYear}
          </h2>
        </div>

        {/* Дни недели */}
        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {WEEKDAYS.map(day => (
            <div key={day} className="bg-gray-100 px-2 py-3 text-center text-sm font-medium text-gray-700">
              {day}
            </div>
          ))}
        </div>

        {/* Дни месяца */}
        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {renderCalendar()}
        </div>
      </div>

      {/* Список праздников и сокращенных дней */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Праздники */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-red-600" />
            Праздники ({selectedYear})
          </h3>
          <div className="space-y-2">
            {Object.entries(calendarData.holidays[selectedYear] || {}).map(([date, data]) => (
              <div key={date} className="flex items-center justify-between p-2 bg-red-50 border border-red-200 rounded">
                <div>
                  <span className="font-medium text-red-800">{data.name}</span>
                  <div className="text-xs text-red-600">{data.description}</div>
                </div>
                <span className="text-sm text-red-700 font-medium">{date}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Сокращенные дни */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-600" />
            Сокращенные дни ({selectedYear})
          </h3>
          <div className="space-y-2">
            {Object.entries(calendarData.shortDays[selectedYear] || {}).map(([date, data]) => (
              <div key={date} className="flex items-center justify-between p-2 bg-yellow-50 border border-yellow-200 rounded">
                <div>
                  <span className="font-medium text-yellow-800">{data.name}</span>
                  <div className="text-xs text-yellow-600">{data.hours} часов работы</div>
                </div>
                <span className="text-sm text-yellow-700 font-medium">{date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
