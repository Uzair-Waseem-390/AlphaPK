import PropTypes from 'prop-types';
import { Banknote, TrendingUp, Package, DollarSign } from 'lucide-react';
import StatCard from './StatCard';
import StatCardSkeleton from './StatCardSkeleton';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (isNaN(num)) return '0';
    const sign = num < 0 ? '-' : '';
    const abs = Math.abs(num);
    if (abs >= 1_000_000) return `${sign}Rs. ${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}Rs. ${(abs / 1_000).toFixed(1)}K`;
    return `${sign}Rs. ${abs.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const SectionHeader = ({ color, label }) => (
    <div className="flex items-center gap-2">
        <span className={`w-1 h-4 rounded-full flex-shrink-0 ${color}`} />
        <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">{label}</h2>
    </div>
);

const ProfitSectionStats = ({ stats, loading, onCardClick }) => {
    if (loading) {
        return (
            <div className="space-y-4">
                <SectionHeader color="bg-primary-500" label="Profit" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <SectionHeader color="bg-primary-500" label="Profit" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                    label="Cash in Hand"
                    value={stats?.cash_in_hand}
                    icon={Banknote}
                    color="primary"
                    onClick={() => onCardClick('cashInHand', 'Cash in Hand Breakdown')}
                />
                <StatCard
                    label="Net Revenue"
                    value={stats?.net_invoice_revenue}
                    icon={TrendingUp}
                    color="green"
                    subtitle={`Before returns: ${fmt(stats?.total_invoice_revenue)}`}
                    onClick={() => onCardClick('profit', 'Profit Breakdown')}
                />
                <StatCard
                    label="Net COGS"
                    value={stats?.net_invoice_cogs}
                    icon={Package}
                    color="amber"
                    subtitle={`Before returns: ${fmt(stats?.total_invoice_cogs)}`}
                    onClick={() => onCardClick('profit', 'Profit Breakdown')}
                />
                <StatCard
                    label="Net Gross Profit"
                    value={stats?.net_gross_profit}
                    icon={DollarSign}
                    color="green"
                    subtitle={`Gross: ${fmt(stats?.total_gross_profit)}`}
                    onClick={() => onCardClick('profit', 'Profit Breakdown')}
                />
            </div>
        </div>
    );
};

ProfitSectionStats.propTypes = {
    stats: PropTypes.object,
    loading: PropTypes.bool,
    onCardClick: PropTypes.func.isRequired,
};

export default ProfitSectionStats;
