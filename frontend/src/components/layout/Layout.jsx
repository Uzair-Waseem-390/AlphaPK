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
    const [billingOpen, setBillingOpen] = useState(false);
    const [expensesOpen, setExpensesOpen] = useState(false); // Add this state
    const [reportsOpen, setReportsOpen] = useState(false);

    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
    const isSuperuser = user?.role === 'superuser';

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
            '/purchases/inventory',
        ];
        return purchasesPaths.some(path => location.pathname.startsWith(path));
    };

    // Check if any billing sub-item is active
    const isBillingActive = () => {
        const billingPaths = [
            '/billing/customers',
            '/billing/customers/outstanding',
            '/billing/invoices',
            '/billing/invoices/outstanding',
            '/billing/payments',
            '/billing/returns',
        ];
        return billingPaths.some(path => location.pathname.startsWith(path));
    };

    // Check if any expenses sub-item is active
    const isExpensesActive = () => {
        const expensesPaths = [
            '/expenses',
            '/expenses/categories',
        ];
        return expensesPaths.some(path => location.pathname.startsWith(path));
    };

    // Check if any reports sub-item is active
    const isReportsActive = () => {
        const reportsPaths = [
            '/reports',
        ];
        return reportsPaths.some(path => location.pathname.startsWith(path));
    };

    const mainNavigation = [
        { name: 'Dashboard', path: '/dashboard', icon: '📊' },
        // Listing all users is superuser-only (see users app permission matrix)
        { name: 'Users', path: '/users', icon: '👥', superuserOnly: true },
        { name: 'Profile', path: '/profile', icon: '👤' },
        // Inventory + Rates are viewable by every role
        { name: 'Inventory', path: '/purchases/inventory', icon: '🏪' },
        { name: 'Rates', path: '/rates', icon: '💰' },
        // Ledger app is admin/superuser-only end to end
        { name: 'Ledger', path: '/ledger', icon: '📒', adminOnly: true },
        // One-time bootstrap tool — superuser only
        { name: 'Data Entry', path: '/data-entry', icon: '📥', superuserOnly: true },
    ].filter(item => (!item.adminOnly || isAdmin) && (!item.superuserOnly || isSuperuser));

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

    const billingNavigation = [
        { name: 'Customers', path: '/billing/customers', icon: '👤' },
        { name: 'Invoices', path: '/billing/invoices', icon: '📄' },
        { name: 'Returns', path: '/billing/returns', icon: '↩️' },
        // Hidden from normal users, still visible to admin/superuser
        { name: 'Payments', path: '/billing/payments', icon: '💰', adminOnly: true },
        { name: 'Invoices Outstanding', path: '/billing/invoices/outstanding', icon: '📊', adminOnly: true },
        { name: 'Customer Outstanding', path: '/billing/customers/outstanding', icon: '📈', adminOnly: true },
    ].filter(item => !item.adminOnly || isAdmin);

    const expensesNavigation = [
        { name: 'Categories', path: '/expenses/categories', icon: '📂' },
        { name: 'All Expenses', path: '/expenses', icon: '📋' },
    ];

    const reportsNavigation = [
        { name: 'Invoices Report', path: '/reports/invoices', icon: '🧾' },
        { name: 'Cash Collected Report', path: '/reports/cash-collected', icon: '💵' },
    ];

    const isActive = (path) => location.pathname === path;
    const isPurchasesActiveNow = isPurchasesActive();
    const isBillingActiveNow = isBillingActive();
    const isExpensesActiveNow = isExpensesActive();
    const isReportsActiveNow = isReportsActive();

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

                        {/* Purchases Section — admin/superuser only */}
                        {isAdmin && (
                        <div className="mt-2 pt-2 border-t border-neutral-200">
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
                        )}

                        {/* Billing Section */}
                        <div className="mt-2 pt-2 border-t border-neutral-200">
                            <button
                                onClick={() => setBillingOpen(!billingOpen)}
                                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isBillingActiveNow
                                    ? 'bg-primary-50 text-primary-700'
                                    : 'text-neutral-600 hover:bg-neutral-100'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">🧾</span>
                                    {sidebarOpen && (
                                        <span className="font-medium">Billing</span>
                                    )}
                                </div>
                                {sidebarOpen && (
                                    <motion.span
                                        animate={{ rotate: billingOpen ? 180 : 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="text-sm"
                                    >
                                        ▼
                                    </motion.span>
                                )}
                            </button>

                            {/* Billing Sub-items */}
                            <AnimatePresence>
                                {billingOpen && sidebarOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="ml-4 space-y-1 overflow-hidden"
                                    >
                                        {billingNavigation.map((item) => (
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

                            {/* When sidebar is collapsed, show billing as icons */}
                            {!sidebarOpen && (
                                <div className="mt-1 space-y-1">
                                    {billingNavigation.map((item) => (
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

                        {/* Expenses Section — admin/superuser only (Cash Flow app) */}
                        {isAdmin && (
                        <div className="mt-2 pt-2 border-t border-neutral-200">
                            <button
                                onClick={() => setExpensesOpen(!expensesOpen)}
                                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isExpensesActiveNow
                                    ? 'bg-primary-50 text-primary-700'
                                    : 'text-neutral-600 hover:bg-neutral-100'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">💸</span>
                                    {sidebarOpen && (
                                        <span className="font-medium">Expenses</span>
                                    )}
                                </div>
                                {sidebarOpen && (
                                    <motion.span
                                        animate={{ rotate: expensesOpen ? 180 : 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="text-sm"
                                    >
                                        ▼
                                    </motion.span>
                                )}
                            </button>

                            {/* Expenses Sub-items */}
                            <AnimatePresence>
                                {expensesOpen && sidebarOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="ml-4 space-y-1 overflow-hidden"
                                    >
                                        {expensesNavigation.map((item) => (
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

                            {/* When sidebar is collapsed, show expenses as icons */}
                            {!sidebarOpen && (
                                <div className="mt-1 space-y-1">
                                    {expensesNavigation.map((item) => (
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
                        )}

                        {/* Reports Section — admin/superuser only */}
                        {isAdmin && (
                            <div className="mt-2 pt-2 border-t border-neutral-200">
                                <button
                                    onClick={() => setReportsOpen(!reportsOpen)}
                                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isReportsActiveNow
                                        ? 'bg-primary-50 text-primary-700'
                                        : 'text-neutral-600 hover:bg-neutral-100'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">📈</span>
                                        {sidebarOpen && (
                                            <span className="font-medium">Reports</span>
                                        )}
                                    </div>
                                    {sidebarOpen && (
                                        <motion.span
                                            animate={{ rotate: reportsOpen ? 180 : 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="text-sm"
                                        >
                                            ▼
                                        </motion.span>
                                    )}
                                </button>

                                {/* Reports Sub-items */}
                                <AnimatePresence>
                                    {reportsOpen && sidebarOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="ml-4 space-y-1 overflow-hidden"
                                        >
                                            {reportsNavigation.map((item) => (
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

                                {/* When sidebar is collapsed, show reports as icons */}
                                {!sidebarOpen && (
                                    <div className="mt-1 space-y-1">
                                        {reportsNavigation.map((item) => (
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
                        )}
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