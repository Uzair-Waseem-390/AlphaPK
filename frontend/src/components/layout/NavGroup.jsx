import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import { ChevronDown } from 'lucide-react';

const NavGroup = ({ group, sidebarOpen, isOpen, onToggle, isAdmin, isSuperuser }) => {
    const location = useLocation();
    const [flyoutOpen, setFlyoutOpen] = useState(false);
    const closeTimer = useRef(null);

    const items = group.items.filter(
        (item) => (!item.adminOnly || isAdmin) && (!item.superuserOnly || isSuperuser)
    );
    if (items.length === 0) return null;

    const groupActive = items.some((item) => location.pathname.startsWith(item.path));
    const GroupIcon = group.icon;

    const openFlyout = () => {
        clearTimeout(closeTimer.current);
        setFlyoutOpen(true);
    };
    const scheduleCloseFlyout = () => {
        closeTimer.current = setTimeout(() => setFlyoutOpen(false), 150);
    };

    // Collapsed icon-only mode — show flyout panel
    if (!sidebarOpen) {
        return (
            <div
                className="relative"
                onMouseEnter={openFlyout}
                onMouseLeave={scheduleCloseFlyout}
            >
                <button
                    type="button"
                    onFocus={openFlyout}
                    onBlur={scheduleCloseFlyout}
                    className={`relative w-full flex items-center justify-center py-2.5 rounded-xl transition-all duration-150 cursor-pointer group
                        ${groupActive
                            ? 'bg-white/10 text-white'
                            : 'text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-300'
                        }`}
                    title={group.label}
                    aria-haspopup="true"
                    aria-expanded={flyoutOpen}
                >
                    {groupActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent-400 rounded-r-full" />
                    )}
                    <GroupIcon className={`w-5 h-5 ${groupActive ? 'text-accent-400' : ''}`} />
                </button>

                <AnimatePresence>
                    {flyoutOpen && (
                        <motion.div
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            transition={{ duration: 0.15 }}
                            onMouseEnter={openFlyout}
                            onMouseLeave={scheduleCloseFlyout}
                            className="absolute left-full top-0 ml-2 z-50 min-w-[210px] bg-neutral-800 rounded-xl shadow-premium border border-white/[0.08] p-2"
                        >
                            <p className="px-3 py-1.5 text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">
                                {group.label}
                            </p>
                            {items.map((item) => {
                                const ItemIcon = item.icon;
                                const active = location.pathname === item.path;
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150
                                            ${active
                                                ? 'bg-white/10 text-white'
                                                : 'text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-100'
                                            }`}
                                    >
                                        <ItemIcon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-accent-400' : ''}`} />
                                        <span className="font-medium">{item.name}</span>
                                    </Link>
                                );
                            })}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    // Expanded mode — collapsible accordion
    return (
        <div>
            <button
                type="button"
                onClick={onToggle}
                className={`relative w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer group
                    ${groupActive
                        ? 'bg-white/10 text-white'
                        : 'text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-100'
                    }`}
            >
                {groupActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent-400 rounded-r-full" />
                )}
                <div className="flex items-center gap-3">
                    <GroupIcon className={`w-[18px] h-[18px] flex-shrink-0 ${groupActive ? 'text-accent-400' : 'text-neutral-500 group-hover:text-neutral-300'}`} />
                    <span className="text-sm font-medium whitespace-nowrap">{group.label}</span>
                </div>
                <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-neutral-600 flex-shrink-0"
                >
                    <ChevronDown className="w-4 h-4" />
                </motion.span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="ml-3 pl-3 border-l border-white/[0.08] mt-1 mb-1 space-y-0.5">
                            {items.map((item) => {
                                const ItemIcon = item.icon;
                                const active = location.pathname === item.path;
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150
                                            ${active
                                                ? 'bg-white/10 text-white'
                                                : 'text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-300'
                                            }`}
                                    >
                                        <ItemIcon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-accent-400' : ''}`} />
                                        <span className="font-medium whitespace-nowrap">{item.name}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

NavGroup.propTypes = {
    group: PropTypes.shape({
        key: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        icon: PropTypes.elementType.isRequired,
        items: PropTypes.array.isRequired,
    }).isRequired,
    sidebarOpen: PropTypes.bool.isRequired,
    isOpen: PropTypes.bool.isRequired,
    onToggle: PropTypes.func.isRequired,
    isAdmin: PropTypes.bool,
    isSuperuser: PropTypes.bool,
};

export default NavGroup;
