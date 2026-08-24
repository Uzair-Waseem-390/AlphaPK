/**
 * CollapsibleGroup — responsive container used in AdminDashboard.
 *
 * Desktop (lg+): rendered as a tab panel. The parent (AdminDashboard) owns
 * the active-tab state and passes `isActive` / `onClick` so all groups share
 * one tab bar.
 *
 * Mobile (< lg): classic animated accordion, self-contained open/close state.
 *
 * Props:
 *  title        — tab label / accordion header text
 *  icon         — lucide icon component
 *  description  — subtitle shown in accordion header only
 *  defaultOpen  — accordion default (mobile only)
 *  isActive     — controlled: is this the selected desktop tab?
 *  onTabClick   — called when the desktop tab button is clicked
 *  children     — section content
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { ChevronDown } from 'lucide-react';

const CollapsibleGroup = ({
    title,
    icon: Icon,
    description,
    defaultOpen = false,
    isActive,          // desktop tab — controlled from parent
    onTabClick,        // desktop tab — controlled from parent
    children,
}) => {
    // Mobile accordion state — independent of desktop tab state
    const [mobileOpen, setMobileOpen] = useState(defaultOpen);

    return (
        <>
            {/* ── MOBILE accordion (hidden on lg+) ── */}
            <div className="lg:hidden bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
                <button
                    type="button"
                    onClick={() => setMobileOpen((o) => !o)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                    <div className="flex items-center gap-3 text-left">
                        <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-4 h-4 text-primary-600" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
                            {description && (
                                <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
                            )}
                        </div>
                    </div>
                    <motion.span
                        animate={{ rotate: mobileOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-neutral-400 flex-shrink-0"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </motion.span>
                </button>

                <AnimatePresence initial={false}>
                    {mobileOpen && (
                        <motion.div
                            key="mobile-body"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22 }}
                            className="overflow-hidden"
                        >
                            <div className="px-5 pb-5 pt-1 space-y-6 border-t border-neutral-100">
                                {children}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── DESKTOP tab panel (hidden below lg) ── */}
            {/* The tab *button* is rendered by AdminDashboard's tab bar — this
                only renders the panel body when this group is the active tab. */}
            <AnimatePresence mode="wait">
                {isActive && (
                    <motion.div
                        key={title}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.2 }}
                        className="hidden lg:block"
                    >
                        <div className="bg-white rounded-2xl shadow-card p-6 space-y-8">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

CollapsibleGroup.propTypes = {
    title: PropTypes.string.isRequired,
    icon: PropTypes.elementType.isRequired,
    description: PropTypes.string,
    defaultOpen: PropTypes.bool,
    isActive: PropTypes.bool,
    onTabClick: PropTypes.func,
    children: PropTypes.node,
};

export default CollapsibleGroup;
