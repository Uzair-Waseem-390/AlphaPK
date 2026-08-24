import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Menu, User, LogOut, ChevronDown, History, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const ROLE_LABELS = { superuser: 'Superuser', admin: 'Admin', user: 'User' };

const Header = ({ user, onToggleSidebar, onLogout, pageTitle }) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const isSuperuser = user?.role === 'superuser';

    return (
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-neutral-200/80">
            <div className="flex items-center justify-between h-[70px] px-4 sm:px-6 gap-4">
                {/* Left — hamburger + page title */}
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        type="button"
                        onClick={onToggleSidebar}
                        aria-label="Toggle navigation"
                        className="p-2 rounded-lg hover:bg-neutral-100 active:bg-neutral-200 transition-colors cursor-pointer flex-shrink-0"
                    >
                        <Menu className="w-5 h-5 text-neutral-500" />
                    </button>

                    {pageTitle && (
                        <div className="hidden sm:block min-w-0">
                            <h1 className="text-[15px] font-semibold text-neutral-800 truncate leading-tight">
                                {pageTitle}
                            </h1>
                        </div>
                    )}
                </div>

                {/* Right — avatar dropdown */}
                <div className="relative flex-shrink-0" ref={dropdownRef}>
                    <button
                        type="button"
                        onClick={() => setDropdownOpen((o) => !o)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-neutral-100 active:bg-neutral-200 transition-colors cursor-pointer"
                    >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-500 to-primary-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 ring-2 ring-neutral-200">
                            {user?.first_name?.[0]}{user?.last_name?.[0]}
                        </div>
                        <span className="hidden sm:flex flex-col items-start leading-tight">
                            <span className="text-sm font-medium text-neutral-800">
                                {user?.first_name} {user?.last_name}
                            </span>
                            <span className="text-[11px] text-neutral-500">
                                {ROLE_LABELS[user?.role] || 'User'}
                            </span>
                        </span>
                        <ChevronDown className={`hidden sm:block w-4 h-4 text-neutral-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                        {dropdownOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                                transition={{ duration: 0.15 }}
                                className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-dropdown border border-neutral-200/80 overflow-hidden z-50"
                            >
                                {/* User info header */}
                                <div className="px-4 py-3 border-b border-neutral-100">
                                    <p className="text-sm font-semibold text-neutral-900 truncate">
                                        {user?.first_name} {user?.last_name}
                                    </p>
                                    <p className="text-xs text-neutral-500 truncate mt-0.5">{user?.email}</p>
                                </div>

                                {/* Menu items */}
                                <div className="p-1.5">
                                    <Link
                                        to="/profile"
                                        onClick={() => setDropdownOpen(false)}
                                        className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
                                    >
                                        <User className="w-4 h-4 text-neutral-400" />
                                        Profile
                                    </Link>
                                    {isSuperuser && (
                                        <Link
                                            to="/users"
                                            onClick={() => setDropdownOpen(false)}
                                            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
                                        >
                                            <Users className="w-4 h-4 text-neutral-400" />
                                            Users
                                        </Link>
                                    )}
                                    {isSuperuser && (
                                        <Link
                                            to="/activity-log"
                                            onClick={() => setDropdownOpen(false)}
                                            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
                                        >
                                            <History className="w-4 h-4 text-neutral-400" />
                                            Activity Log
                                        </Link>
                                    )}
                                </div>

                                <div className="p-1.5 border-t border-neutral-100">
                                    <button
                                        type="button"
                                        onClick={() => { setDropdownOpen(false); onLogout(); }}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-error-600 hover:bg-error-50 transition-colors cursor-pointer"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Sign out
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </header>
    );
};

Header.propTypes = {
    user: PropTypes.object,
    onToggleSidebar: PropTypes.func.isRequired,
    onLogout: PropTypes.func.isRequired,
    pageTitle: PropTypes.string,
};

export default Header;
