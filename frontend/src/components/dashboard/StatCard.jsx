import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

// Semantic color config: icon bg + icon color + subtle card accent ring
const COLOR_CONFIG = {
    primary: {
        iconBg: 'bg-primary-50',
        iconColor: 'text-primary-600',
        dot: 'bg-primary-500',
    },
    green: {
        iconBg: 'bg-success-50',
        iconColor: 'text-success-600',
        dot: 'bg-success-500',
    },
    amber: {
        iconBg: 'bg-warning-50',
        iconColor: 'text-warning-600',
        dot: 'bg-warning-500',
    },
    red: {
        iconBg: 'bg-error-50',
        iconColor: 'text-error-600',
        dot: 'bg-error-500',
    },
    blue: {
        iconBg: 'bg-info-50',
        iconColor: 'text-info-600',
        dot: 'bg-info-500',
    },
    orange: {
        iconBg: 'bg-orange-50',
        iconColor: 'text-orange-600',
        dot: 'bg-orange-500',
    },
    purple: {
        iconBg: 'bg-purple-50',
        iconColor: 'text-purple-600',
        dot: 'bg-purple-500',
    },
};

// Abbreviated to K/M/B so the box width stays consistent as real data
// grows over months/years — the exact figure is still available via the
// title tooltip on hover.
const formatCurrency = (val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return 'Rs. 0.00';
    const sign = num < 0 ? '-' : '';
    const abs = Math.abs(num);
    if (abs >= 1_000_000_000) return `${sign}Rs. ${(abs / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${sign}Rs. ${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 100_000) return `${sign}Rs. ${(abs / 1_000).toFixed(1)}K`;
    return `${sign}Rs. ${abs.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatFullCurrency = (val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return 'Rs. 0.00';
    return `Rs. ${num.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatNumber = (val) => {
    const num = typeof val === 'string' ? parseInt(val) : val;
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-PK');
};

const StatCard = ({
    label,
    value,
    icon: Icon,
    color = 'primary',
    isCurrency = true,
    onClick,
    loading = false,
    subtitle,
}) => {
    const cfg = COLOR_CONFIG[color] || COLOR_CONFIG.primary;

    const displayValue = loading ? null : isCurrency ? formatCurrency(value) : formatNumber(value);
    const fullValueTitle = loading ? undefined : isCurrency ? formatFullCurrency(value) : formatNumber(value);

    return (
        <motion.div
            whileHover={{ y: -3, transition: { duration: 0.18 } }}
            whileTap={{ scale: 0.98 }}
            className={`h-full ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
            onClick={onClick}
        >
            <div
                className={`relative h-full min-h-[108px] bg-white rounded-2xl p-5
                    shadow-card hover:shadow-card-hover
                    transition-all duration-200
                    flex flex-col justify-between gap-3
                    overflow-hidden`}
            >
                {/* Subtle color dot accent — top-left corner */}
                <span className={`absolute top-0 left-0 w-1 h-full rounded-l-2xl ${cfg.dot} opacity-60`} />

                <div className="flex items-start justify-between gap-3 pl-2">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-neutral-500 truncate">
                            {label}
                        </p>

                        {loading ? (
                            <div className="mt-2 space-y-1.5">
                                <div className="h-6 w-24 bg-neutral-100 rounded-lg animate-pulse" />
                                {subtitle !== undefined && (
                                    <div className="h-3 w-16 bg-neutral-100 rounded animate-pulse" />
                                )}
                            </div>
                        ) : (
                            <>
                                <p
                                    className="text-xl font-bold text-neutral-900 mt-1.5 truncate tabular-nums leading-tight"
                                    title={fullValueTitle}
                                >
                                    {displayValue}
                                </p>
                                {subtitle && (
                                    <p
                                        className="text-[11px] text-neutral-400 mt-1 truncate font-medium"
                                        title={subtitle}
                                    >
                                        {subtitle}
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                    {Icon && (
                        <div className={`w-10 h-10 rounded-xl ${cfg.iconBg} flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

StatCard.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    icon: PropTypes.elementType,
    color: PropTypes.oneOf(['primary', 'green', 'amber', 'red', 'blue', 'orange', 'purple']),
    isCurrency: PropTypes.bool,
    onClick: PropTypes.func,
    loading: PropTypes.bool,
    subtitle: PropTypes.string,
};

export default StatCard;
