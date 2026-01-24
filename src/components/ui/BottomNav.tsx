import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    Database,
    PlusCircle,
    BarChart2,
    LineChart,
    Bell,
    Calendar,
    Scissors,
    Settings,
    Layers
} from 'lucide-react';

interface NavItem {
    to: string;
    label: string;
    icon: React.ReactNode;
}

const primaryNavItems: NavItem[] = [
    { to: '/data', label: 'Данные', icon: <Database className="w-6 h-6" /> },
    { to: '/results', label: 'Тикер', icon: <BarChart2 className="w-6 h-6" /> },
    { to: '/multi-ticker', label: 'Мульти', icon: <LineChart className="w-6 h-6" /> },
    { to: '/watches', label: 'Сигналы', icon: <Bell className="w-6 h-6" /> },
];

const secondaryNavItems: NavItem[] = [
    { to: '/multi-ticker-options', label: 'Опционы', icon: <Layers className="w-6 h-6" /> },
    { to: '/enhance', label: 'Новые', icon: <PlusCircle className="w-6 h-6" /> },
    { to: '/calendar', label: 'Календарь', icon: <Calendar className="w-6 h-6" /> },
    { to: '/split', label: 'Сплиты', icon: <Scissors className="w-6 h-6" /> },
    { to: '/settings', label: 'Настройки', icon: <Settings className="w-6 h-6" /> },
];

export function BottomNav() {
    const location = useLocation();
    const [page, setPage] = useState(0);
    const touchStart = useRef<number | null>(null);
    const touchEnd = useRef<number | null>(null);

    // Sync page with location when it changes
    useEffect(() => {
        const isSecondary = secondaryNavItems.some(item => location.pathname.startsWith(item.to));
        setPage(isSecondary ? 1 : 0);
    }, [location.pathname]);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStart.current = e.targetTouches[0].clientX;
        touchEnd.current = null;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        touchEnd.current = e.targetTouches[0].clientX;
    };

    const handleTouchEnd = () => {
        if (!touchStart.current || !touchEnd.current) return;
        const distance = touchStart.current - touchEnd.current;
        const isLeftSwipe = distance > 50;
        const isRightSwipe = distance < -50;

        if (isLeftSwipe && page === 0) {
            setPage(1);
        }
        if (isRightSwipe && page === 1) {
            setPage(0);
        }

        touchStart.current = null;
        touchEnd.current = null;
    };

    const navItems = page === 0 ? primaryNavItems : secondaryNavItems;

    return (
        <nav
            className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 z-40 safe-area-pb"
            role="navigation"
            aria-label="Основная навигация"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div className="flex justify-around items-center h-16">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) => `
              flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg min-w-[64px]
              transition-all duration-200
              ${isActive
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                            }
            `}
                    >
                        {({ isActive }) => (
                            <>
                                <div className={`
                  p-1.5 rounded-full transition-all duration-200
                  ${isActive ? 'bg-indigo-100 dark:bg-indigo-950' : ''}
                `}>
                                    {item.icon}
                                </div>
                                <span className={`text-xs font-medium ${isActive ? 'text-indigo-600 dark:text-indigo-400' : ''}`}>
                                    {item.label}
                                </span>
                            </>
                        )}
                    </NavLink>
                ))}
            </div>

            {/* Page indicator dots */}
            <div className="absolute top-1 left-1/2 transform -translate-x-1/2 flex gap-1.5 p-2 pointer-events-none">
                <div
                    className={`w-2 h-2 rounded-full transition-colors ${page === 0 ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                />
                <div
                    className={`w-2 h-2 rounded-full transition-colors ${page === 1 ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                />
            </div>
        </nav>
    );
}
