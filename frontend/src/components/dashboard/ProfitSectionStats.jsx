import PropTypes from 'prop-types';
import StatCard from './StatCard';
import StatCardSkeleton from './StatCardSkeleton';

const ProfitSectionStats = ({ stats, loading }) => {
    if (loading) {
        return (
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Profit</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCardSkeleton color="green" />
                    <StatCardSkeleton color="green" />
                    <StatCardSkeleton color="green" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900">Profit</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                    label="Total Revenue"
                    value={stats?.total_invoice_revenue}
                    icon="📈"
                    color="green"
                />
                <StatCard
                    label="Total COGS"
                    value={stats?.total_invoice_cogs}
                    icon="📦"
                    color="amber"
                />
                <StatCard
                    label="Total Gross Profit"
                    value={stats?.total_gross_profit}
                    icon="💰"
                    color="green"
                />
            </div>
        </div>
    );
};

ProfitSectionStats.propTypes = {
    stats: PropTypes.object,
    loading: PropTypes.bool,
};

export default ProfitSectionStats;
