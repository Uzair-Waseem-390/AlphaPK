import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

// All variants use the project's design-token color scale — no raw Tailwind
// color names (blue-100, red-100, etc.) to keep the palette consistent.
const Badge = ({ variant = 'default', children, className = '', ...props }) => {
    const variants = {
        default:   'bg-neutral-100 text-neutral-600',
        draft:     'bg-neutral-100 text-neutral-600',
        confirmed: 'bg-info-50 text-info-700',
        unpaid:    'bg-error-50 text-error-700',
        partial:   'bg-warning-50 text-warning-700',
        paid:      'bg-success-50 text-success-700',
        pending:   'bg-warning-50 text-warning-700',
        accepted:  'bg-success-50 text-success-700',
        success:   'bg-success-50 text-success-700',
        warning:   'bg-warning-50 text-warning-700',
        error:     'bg-error-50 text-error-700',
        info:      'bg-info-50 text-info-700',
    };

    return (
        <motion.span
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${variants[variant] ?? variants.default} ${className}`}
            {...props}
        >
            {children}
        </motion.span>
    );
};

Badge.propTypes = {
    variant: PropTypes.oneOf([
        'default', 'draft', 'confirmed', 'unpaid', 'partial',
        'paid', 'pending', 'accepted', 'success', 'warning', 'error', 'info',
    ]),
    children: PropTypes.node,
    className: PropTypes.string,
};

export default Badge;
