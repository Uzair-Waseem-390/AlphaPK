import PropTypes from 'prop-types';
import StatCard from './StatCard';
import StatCardSkeleton from './StatCardSkeleton';

const ProfitSectionStats = ({ stats, loading, onCardClick }) => {
    if (loading) {
        return (
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Profit</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCardSkeleton color="primary" />
                    <StatCardSkeleton color="green" />
                    <StatCardSkeleton color="amber" />
                    <StatCardSkeleton color="green" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900">Profit</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                    label="Cash in Hand"
                    value={stats?.cash_in_hand}
                    icon="💵"
                    color="primary"
                    onClick={() => onCardClick('cashInHand', 'Cash in Hand Breakdown')}
                />
                <StatCard
                    label="Total Revenue"
                    value={stats?.total_invoice_revenue}
                    icon="📈"
                    color="green"
                    onClick={() => onCardClick('profit', 'Profit Breakdown')}
                />
                <StatCard
                    label="Total COGS"
                    value={stats?.total_invoice_cogs}
                    icon="📦"
                    color="amber"
                    onClick={() => onCardClick('profit', 'Profit Breakdown')}
                />
                <StatCard
                    label="Total Gross Profit"
                    value={stats?.total_gross_profit}
                    icon="💰"
                    color="green"
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
