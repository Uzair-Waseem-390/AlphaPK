import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { mainNavigation, navGroups, standaloneLinks } from '../../config/navigation';
import NavGroup from './NavGroup';

const Sidebar = ({ desktopOpen, mobileOpen, onCloseMobile }) => {
    const { user } = useAuth();
    const location = useLocation();
    const [openGroups, setOpenGroups] = useState(new Set());

    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
    const isSuperuser = user?.role === 'superuser';

    useEffect(() => {
        onCloseMobile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    const toggleGroup = (key) => {
        setOpenGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const isActive = (path) => location.pathname === path;

    const visibleMainNav = mainNavigation.filter(
        (item) => (!item.adminOnly || isAdmin) && (!item.superuserOnly || isSuperuser)
    );
    const visibleGroups = navGroups.filter((g) => !g.adminOnly || isAdmin);
    const visibleStandalone = standaloneLinks.filter(
        (l) => (!l.adminOnly || isAdmin) && (!l.superuserOnly || isSuperuser)
    );

    const sidebarExpanded = desktopOpen || mobileOpen;

    return (
        <>
            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden"
                    onClick={onCloseMobile}
                    aria-hidden="true"
                />
            )}

            <motion.aside
                className={`fixed top-0 left-0 h-full z-40 flex flex-col
                    bg-neutral-900 border-r border-white/[0.06]
                    transition-all duration-300
                    ${desktopOpen ? 'lg:w-64' : 'lg:w-[70px]'}
                    w-64 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
            >
                {/* Logo */}
                <div className={`flex items-center h-[70px] px-4 flex-shrink-0 border-b border-white/[0.06] ${!sidebarExpanded ? 'justify-center' : ''}`}>
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden bg-white/10 border border-white/10 flex-shrink-0">
                            <img
                                src="/logo.svg"
                                alt={import.meta.env.VITE_APP_NAME}
                                className="w-full h-full object-contain p-1"
                            />
                        </div>
                        {sidebarExpanded && (
                            <motion.div
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.18 }}
                                className="min-w-0"
                            >
                                <span className="text-[15px] font-bold text-white tracking-tight whitespace-nowrap block truncate">
                                    {import.meta.env.VITE_APP_NAME}
                                </span>
                                <span className="text-[10px] font-medium text-white/40 tracking-widest uppercase whitespace-nowrap block">
                                    Business Suite
                                </span>
                            </motion.div>
                        )}
                    </div>
                </div>

                {/* Navigation */}
                <nav
                    className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 space-y-0.5 dark-scroll"
                >
                    {visibleMainNav.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.path);
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                title={!sidebarExpanded ? item.name : undefined}
                                className={`relative flex items-center gap-3 rounded-xl transition-all duration-150 group
                                    ${sidebarExpanded ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center'}
                                    ${active
                                        ? 'bg-white/10 text-white'
                                        : 'text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-100'
                                    }`}
                            >
                                {/* Active left bar */}
                                {active && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent-400 rounded-r-full" />
                                )}
                                <Icon className={`flex-shrink-0 transition-colors ${sidebarExpanded ? 'w-[18px] h-[18px]' : 'w-5 h-5'} ${active ? 'text-accent-400' : 'text-neutral-500 group-hover:text-neutral-300'}`} />
                                {sidebarExpanded && (
                                    <span className="text-sm font-medium whitespace-nowrap">{item.name}</span>
                                )}
                            </Link>
                        );
                    })}

                    {visibleGroups.map((group) => (
                        <NavGroup
                            key={group.key}
                            group={group}
                            sidebarOpen={sidebarExpanded}
                            isOpen={openGroups.has(group.key)}
                            onToggle={() => toggleGroup(group.key)}
                            isAdmin={isAdmin}
                            isSuperuser={isSuperuser}
                        />
                    ))}

                    {/* Standalone links */}
                    {visibleStandalone.length > 0 && (
                        <div className="pt-3 mt-3 border-t border-white/[0.06] space-y-0.5">
                            {visibleStandalone.map((item) => {
                                const Icon = item.icon;
                                const active = isActive(item.path);
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        title={!sidebarExpanded ? item.name : undefined}
                                        className={`relative flex items-center gap-3 rounded-xl transition-all duration-150 group
                                            ${sidebarExpanded ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center'}
                                            ${active
                                                ? 'bg-white/10 text-white'
                                                : 'text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-100'
                                            }`}
                                    >
                                        {active && (
                                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent-400 rounded-r-full" />
                                        )}
                                        <Icon className={`flex-shrink-0 transition-colors ${sidebarExpanded ? 'w-[18px] h-[18px]' : 'w-5 h-5'} ${active ? 'text-accent-400' : 'text-neutral-500 group-hover:text-neutral-300'}`} />
                                        {sidebarExpanded && (
                                            <span className="text-sm font-medium whitespace-nowrap">{item.name}</span>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </nav>

                {/* User footer */}
                <div className="flex-shrink-0 p-3 border-t border-white/[0.06]">
                    <div className={`flex items-center gap-3 rounded-xl bg-white/[0.05] p-2.5 ${!sidebarExpanded ? 'justify-center' : ''}`}>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-500 to-primary-600 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 ring-2 ring-white/10">
                            {user?.first_name?.[0]}{user?.last_name?.[0]}
                        </div>
                        {sidebarExpanded && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex-1 min-w-0"
                            >
                                <p className="text-sm font-medium text-white truncate leading-tight">
                                    {user?.first_name} {user?.last_name}
                                </p>
                                <p className="text-[11px] text-neutral-500 truncate leading-tight capitalize">
                                    {user?.role}
                                </p>
                            </motion.div>
                        )}
                        {sidebarExpanded && (
                            <Link
                                to="/profile"
                                title="Profile settings"
                                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-white/10 transition-colors flex-shrink-0"
                            >
                                <Settings className="w-4 h-4" />
                            </Link>
                        )}
                    </div>
                </div>
            </motion.aside>
        </>
    );
};

Sidebar.propTypes = {
    desktopOpen: PropTypes.bool.isRequired,
    mobileOpen: PropTypes.bool.isRequired,
    onCloseMobile: PropTypes.func.isRequired,
};

export default Sidebar;
