/**
 * PageHeader — single canonical page header used across every page.
 *
 * Props:
 *   title      string   — main heading (required)
 *   subtitle   string   — descriptive subtext below title
 *   icon       element  — lucide icon component; renders gradient icon box when provided
 *   actions    node     — right-side slot (buttons, links, etc.)
 *   backLink   node     — optional BackLink element rendered above the header
 *   badge      node     — optional badge rendered inline after the title
 *   className  string   — extra classes on the outer wrapper
 */
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

const PageHeader = ({
    title,
    subtitle,
    icon: Icon,
    actions,
    backLink,
    badge,
    className = '',
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={`flex flex-col gap-4 ${className}`}
        >
            {backLink && <div>{backLink}</div>}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Left — icon box + title/subtitle */}
                <div className="flex items-center gap-3 min-w-0">
                    {Icon && (
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-700 to-accent-600 flex items-center justify-center shadow-md shadow-primary-900/20 flex-shrink-0">
                            <Icon className="w-5 h-5 text-white" />
                        </div>
                    )}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 leading-tight">
                                {title}
                            </h1>
                            {badge && badge}
                        </div>
                        {subtitle && (
                            <p className="text-sm text-neutral-500 mt-0.5">
                                {subtitle}
                            </p>
                        )}
                    </div>
                </div>

                {/* Right — action buttons */}
                {actions && (
                    <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap flex-shrink-0">
                        {actions}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

PageHeader.propTypes = {
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    icon: PropTypes.elementType,
    actions: PropTypes.node,
    backLink: PropTypes.node,
    badge: PropTypes.node,
    className: PropTypes.string,
};

export default PageHeader;
