import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';

// Abbreviated formatter — keeps card width stable as values grow
const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (isNaN(num)) return '0';
    const sign = num < 0 ? '-' : '';
    const abs = Math.abs(num);
    if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${abs.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

// Lightweight count-up — animates from 0 to target over ~900ms
const useCountUp = (target, active) => {
    const [display, setDisplay] = useState(0);
    const rafRef = useRef(null);
    const startRef = useRef(null);
    const duration = 900;

    useEffect(() => {
        if (!active || target === null || target === undefined || isNaN(Number(target))) {
            setDisplay(target);
            return;
        }
        const end = Number(target);
        cancelAnimationFrame(rafRef.current);
        startRef.current = null;

        const step = (ts) => {
            if (!startRef.current) startRef.current = ts;
            const progress = Math.min((ts - startRef.current) / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(end * eased);
            if (progress < 1) rafRef.current = requestAnimationFrame(step);
            else setDisplay(end);
        };
        rafRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(rafRef.current);
    }, [target, active]); // eslint-disable-line react-hooks/exhaustive-deps

    return display;
};

// Card color configs — gradient + watermark tint
const CARD_CONFIGS = {
    primary: {
        gradient: 'from-primary-700 via-primary-800 to-primary-900',
        glow: 'shadow-[0_8px_32px_-8px_rgba(36,59,83,0.55)]',
        ring: 'ring-primary-600/30',
    },
    green: {
        gradient: 'from-emerald-600 via-emerald-700 to-teal-800',
        glow: 'shadow-[0_8px_32px_-8px_rgba(5,150,105,0.55)]',
        ring: 'ring-emerald-500/30',
    },
    amber: {
        gradient: 'from-amber-500 via-amber-600 to-orange-700',
        glow: 'shadow-[0_8px_32px_-8px_rgba(217,119,6,0.55)]',
        ring: 'ring-amber-500/30',
    },
    rose: {
        gradient: 'from-rose-500 via-rose-600 to-red-700',
        glow: 'shadow-[0_8px_32px_-8px_rgba(225,29,72,0.55)]',
        ring: 'ring-rose-500/30',
    },
};

const KpiCard = ({ item, index }) => {
    const config = CARD_CONFIGS[item.color] || CARD_CONFIGS.primary;
    const animatedValue = useCountUp(item.value, true);
    const Icon = item.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.07, duration: 0.4 }}
            whileHover={item.onClick ? { y: -4, transition: { duration: 0.18 } } : {}}
            whileTap={item.onClick ? { scale: 0.97 } : {}}
            onClick={item.onClick}
            className={`relative overflow-hidden rounded-2xl p-5 text-white
                bg-gradient-to-br ${config.gradient}
                ${config.glow}
                ring-1 ${config.ring}
                ${item.onClick ? 'cursor-pointer' : ''}
                min-h-[120px] flex flex-col justify-between`}
        >
            {/* Watermark icon — large faded, bottom-right */}
            {Icon && (
                <div className="absolute -bottom-3 -right-3 opacity-[0.12] pointer-events-none">
                    <Icon className="w-24 h-24" />
                </div>
            )}

            {/* Top row: label + icon badge */}
            <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium text-white/75 leading-tight">
                    {item.label}
                </p>
                {Icon && (
                    <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
                        <Icon className="w-4 h-4 text-white/90" />
                    </div>
                )}
            </div>

            {/* Value */}
            <div>
                <p
                    className="text-[26px] font-bold tracking-tight leading-none tabular-nums mt-2"
                    title={`Rs. ${Number(item.value ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                >
                    Rs.&nbsp;{fmt(animatedValue)}
                </p>
                {item.subtitle && (
                    <p className="text-[11px] text-white/60 mt-1.5 font-medium">{item.subtitle}</p>
                )}
            </div>
        </motion.div>
    );
};

KpiCard.propTypes = {
    item: PropTypes.shape({
        label: PropTypes.string.isRequired,
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        icon: PropTypes.elementType,
        color: PropTypes.oneOf(['primary', 'green', 'amber', 'rose']),
        subtitle: PropTypes.string,
        onClick: PropTypes.func,
    }).isRequired,
    index: PropTypes.number.isRequired,
};

const KpiStripSkeleton = () => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
            <div
                key={i}
                className="h-[120px] rounded-2xl bg-neutral-200 animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
            />
        ))}
    </div>
);

const KpiStrip = ({ items, loading }) => {
    if (loading) return <KpiStripSkeleton />;

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {items.map((item, i) => (
                <KpiCard key={item.label} item={item} index={i} />
            ))}
        </div>
    );
};

KpiStrip.propTypes = {
    items: PropTypes.arrayOf(PropTypes.shape({
        label: PropTypes.string.isRequired,
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        icon: PropTypes.elementType,
        color: PropTypes.oneOf(['primary', 'green', 'amber', 'rose']),
        subtitle: PropTypes.string,
        onClick: PropTypes.func,
    })).isRequired,
    loading: PropTypes.bool,
};

export default KpiStrip;
