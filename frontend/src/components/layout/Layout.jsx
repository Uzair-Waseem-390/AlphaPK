import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Button from '../ui/Button';

const Layout = ({ children }) => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [purchasesOpen, setPurchasesOpen] = useState(false);

    // Check if any purchases sub-item is active
    const isPurchasesActive = () => {
        const purchasesPaths = [
            '/purchases/categories',
            '/purchases/shelves',
            '/purchases/suppliers',
            '/purchases/products',
            '/purchases/orders',
            '/purchases/payments',
            '/purchases/returns',
            '/purchases/suppliers/outstanding',
        ];
        return purchasesPaths.some(path => location.pathname.startsWith(path));
    };

    const mainNavigation = [
        { name: 'Dashboard', path: '/dashboard', icon: '📊' },
        { name: 'Users', path: '/users', icon: '👥' },
        { name: 'Profile', path: '/profile', icon: '👤' },
        { name: 'Inventory', path: '/purchases/inventory', icon: '🏪' },
        { name: 'Rates', path: '/rates', icon: '💰' },
    ];

    const purchasesNavigation = [
        { name: 'Categories', path: '/purchases/categories', icon: '📂' },
        { name: 'Shelves', path: '/purchases/shelves', icon: '📚' },
        { name: 'Suppliers', path: '/purchases/suppliers', icon: '🏢' },
        { name: 'Products', path: '/purchases/products', icon: '📦' },
        { name: 'Orders', path: '/purchases/orders', icon: '📋' },
        { name: 'Payments', path: '/purchases/payments', icon: '💰' },
        { name: 'Returns', path: '/purchases/returns', icon: '↩️' },
        { name: 'Outstanding', path: '/purchases/suppliers/outstanding', icon: '📊' },
    ];

    const isActive = (path) => location.pathname === path;
    const isPurchasesActiveNow = isPurchasesActive();

    return (
        <div className="min-h-screen bg-neutral-50">
            {/* Sidebar */}
            <motion.aside
                className={`fixed top-0 left-0 h-full bg-white border-r border-neutral-200 z-40 transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-20'
                    }`}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
            >
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="flex items-center h-16 px-4 border-b border-neutral-200">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-indigo-600 flex items-center justify-center text-white font-bold">
                                ERP
                            </div>
                            {sidebarOpen && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-lg font-bold text-neutral-900"
                                >
                                    ERP System
                                </motion.span>
                            )}
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                        {/* Main Navigation */}
                        {mainNavigation.map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive(item.path)
                                        ? 'bg-primary-50 text-primary-700'
                                        : 'text-neutral-600 hover:bg-neutral-100'
                                    }`}
                            >
                                <span className="text-xl">{item.icon}</span>
                                {sidebarOpen && (
                                    <motion.span
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="font-medium"
                                    >
                                        {item.name}
                                    </motion.span>
                                )}
                            </Link>
                        ))}

                        {/* Purchases Section */}
                        <div className="mt-2 pt-2 border-t border-neutral-200">
                            {/* Purchases Toggle */}
                            <button
                                onClick={() => setPurchasesOpen(!purchasesOpen)}
                                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isPurchasesActiveNow
                                        ? 'bg-primary-50 text-primary-700'
                                        : 'text-neutral-600 hover:bg-neutral-100'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">🛒</span>
                                    {sidebarOpen && (
                                        <span className="font-medium">Purchases</span>
                                    )}
                                </div>
                                {sidebarOpen && (
                                    <motion.span
                                        animate={{ rotate: purchasesOpen ? 180 : 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="text-sm"
                                    >
                                        ▼
                                    </motion.span>
                                )}
                            </button>

                            {/* Purchases Sub-items */}
                            <AnimatePresence>
                                {purchasesOpen && sidebarOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="ml-4 space-y-1 overflow-hidden"
                                    >
                                        {purchasesNavigation.map((item) => (
                                            <Link
                                                key={item.path}
                                                to={item.path}
                                                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm ${isActive(item.path)
                                                        ? 'bg-primary-50 text-primary-700'
                                                        : 'text-neutral-600 hover:bg-neutral-100'
                                                    }`}
                                            >
                                                <span className="text-base">{item.icon}</span>
                                                <span className="font-medium">{item.name}</span>
                                            </Link>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* When sidebar is collapsed, show purchases as icons */}
                            {!sidebarOpen && (
                                <div className="mt-1 space-y-1">
                                    {purchasesNavigation.map((item) => (
                                        <Link
                                            key={item.path}
                                            to={item.path}
                                            className={`flex items-center justify-center px-4 py-3 rounded-xl transition-all duration-200 ${isActive(item.path)
                                                    ? 'bg-primary-50 text-primary-700'
                                                    : 'text-neutral-600 hover:bg-neutral-100'
                                                }`}
                                            title={item.name}
                                        >
                                            <span className="text-xl">{item.icon}</span>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </nav>

                    {/* User Info */}
                    <div className="p-4 border-t border-neutral-200">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm">
                                {user?.first_name?.[0]}{user?.last_name?.[0]}
                            </div>
                            {sidebarOpen && (
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-neutral-900 truncate">
                                        {user?.first_name} {user?.last_name}
                                    </p>
                                    <p className="text-xs text-neutral-500 truncate">{user?.email}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.aside>

            {/* Main Content */}
            <div className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
                {/* Header */}
                <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-neutral-200">
                    <div className="flex items-center justify-between h-16 px-6">
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
                        >
                            <svg className="w-6 h-6 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>

                        <div className="flex items-center gap-4">
                            <span className="text-sm text-neutral-500">
                                {user?.role === 'superuser' ? 'Superuser' : user?.role === 'admin' ? 'Admin' : 'User'}
                            </span>
                            <Button size="sm" variant="outline" onClick={logout}>
                                Logout
                            </Button>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="p-6">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default Layout;