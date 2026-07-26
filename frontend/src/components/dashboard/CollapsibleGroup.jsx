import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';

const CollapsibleGroup = ({ title, icon, description, defaultOpen = false, children }) => {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="bg-white rounded-2xl shadow-card border border-neutral-100 overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-neutral-50 transition-colors"
            >
                <div className="flex items-center gap-3 text-left">
                    <span className="text-2xl">{icon}</span>
                    <div>
                        <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
                        {description && (
                            <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
                        )}
                    </div>
                </div>
                <motion.span
                    animate={{ rotate: open ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-neutral-400 shrink-0"
                >
                    ▼
                </motion.span>
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="px-6 pb-6 pt-2 space-y-8 border-t border-neutral-100">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

CollapsibleGroup.propTypes = {
    title: PropTypes.string.isRequired,
    icon: PropTypes.string.isRequired,
    description: PropTypes.string,
    defaultOpen: PropTypes.bool,
    children: PropTypes.node,
};

export default CollapsibleGroup;
