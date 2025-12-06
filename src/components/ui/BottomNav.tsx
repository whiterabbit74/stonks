import { NavLink, useLocation } from 'react-router-dom';
import {
    Database,
    PlusCircle,
    BarChart2,
    LineChart,
    Bell,
    Calendar,
    Scissors,
    Settings
} from 'lucide-react';

interface NavItem {
    to: string;
    label: string;
    icon: React.ReactNode;
}

const primaryNavItems: NavItem[] = [
    { to: '/data', label: 'Данные', icon: <Database className="w-5 h-5" /> },
    { to: '/results', label: 'Тикер', icon: <BarChart2 className="w-5 h-5" /> },
    { to: '/multi-ticker', label: 'Мульти', icon: <LineChart className="w-5 h-5" /> },
    { to: '/watches', label: 'Сигналы', icon: <Bell className="w-5 h-5" /> },
];

const secondaryNavItems: NavItem[] = [
    { to: '/enhance', label: 'Новые', icon: <PlusCircle className="w-5 h-5" /> },
    { to: '/calendar', label: 'Календарь', icon: <Calendar className="w-5 h-5" /> },
    { to: '/split', label: 'Сплиты', icon: <Scissors className="w-5 h-5" /> },
    { to: '/settings', label: 'Настройки', icon: <Settings className="w-5 h-5" /> },
];

export function BottomNav() {
    const location = useLocation();

    // Show secondary nav if on those pages
    const isSecondaryPage = secondaryNavItems.some(item => location.pathname.startsWith(item.to));
    const navItems = isSecondaryPage ? secondaryNavItems : primaryNavItems;

    return (
        <nav
            className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 z-40 safe-area-pb"
            role="navigation"
            aria-label="Основная навигация"
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
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 flex gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full transition-colors ${!isSecondaryPage ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`} />
                <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isSecondaryPage ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`} />
            </div>
        </nav>
    );
}
