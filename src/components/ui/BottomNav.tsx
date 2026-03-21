import { NavLink } from 'react-router-dom';
import { Database, LineChart, Layers, Wallet } from 'lucide-react';

const NAV_ITEMS = [
    { to: '/data', label: 'Данные', icon: <Database className="w-6 h-6" /> },
    { to: '/stocks', label: 'Акции', icon: <LineChart className="w-6 h-6" /> },
    { to: '/multi-ticker-options', label: 'Опционы', icon: <Layers className="w-6 h-6" /> },
    { to: '/broker', label: 'Брокер', icon: <Wallet className="w-6 h-6" /> },
];

export function BottomNav() {
    return (
        <nav
            className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 z-40 safe-area-pb"
            role="navigation"
            aria-label="Основная навигация"
        >
            <div className="grid grid-cols-4 items-center h-16">
                {NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) => `
              flex flex-col items-center justify-center gap-1 py-2
              transition-all duration-200
              ${isActive
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                            }
            `}
                    >
                        {({ isActive }) => (
                            <>
                                <div className={`p-1.5 rounded-full transition-all duration-200 ${isActive ? 'bg-indigo-100 dark:bg-indigo-950' : ''}`}>
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
        </nav>
    );
}
