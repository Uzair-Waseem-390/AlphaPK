import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import Card from '../ui/Card';

const StatCard = ({
    label,
    value,
    icon,
    color = 'primary',
    isCurrency = true,
    onClick,
    loading = false,
    subtitle,
}) => {
    const colors = {
        primary: 'border-l-4 border-primary-500',
        green: 'border-l-4 border-success-500',
        amber: 'border-l-4 border-warning-500',
        red: 'border-l-4 border-error-500',
        blue: 'border-l-4 border-info-500',
        orange: 'border-l-4 border-orange-500',
        purple: 'border-l-4 border-purple-500',
    };

    const formatCurrency = (val) => {
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(num)) return 'Rs. 0.00';
        return `Rs. ${num.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatNumber = (val) => {
        const num = typeof val === 'string' ? parseInt(val) : val;
        if (isNaN(num)) return '0';
        return num.toLocaleString('en-PK');
    };

    const displayValue = loading ? '...' : isCurrency ? formatCurrency(value) : formatNumber(value);

    return (
        <motion.div
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            whileTap={{ scale: 0.98 }}
            className={`cursor-pointer ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
            onClick={onClick}
        >
            <Card className={`p-5 ${colors[color] || colors.primary} hover:shadow-card-hover transition-all`}>
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <p className="text-sm font-medium text-neutral-500">{label}</p>
                        <p className="text-2xl font-bold text-neutral-900 mt-1">{displayValue}</p>
                        {subtitle && <p className="text-xs text-neutral-400 mt-1">{subtitle}</p>}
                    </div>
                    {icon && (
                        <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-xl flex-shrink-0">
                            {icon}
                        </div>
                    )}
                </div>
            </Card>
        </motion.div>
    );
};

StatCard.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    icon: PropTypes.node,
    color: PropTypes.oneOf(['primary', 'green', 'amber', 'red', 'blue', 'orange', 'purple']),
    isCurrency: PropTypes.bool,
    onClick: PropTypes.func,
    loading: PropTypes.bool,
    subtitle: PropTypes.string,
};

export default StatCard;