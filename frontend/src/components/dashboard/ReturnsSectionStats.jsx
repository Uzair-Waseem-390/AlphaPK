import PropTypes from 'prop-types';
import StatCard from './StatCard';
import StatCardSkeleton from './StatCardSkeleton';

const ReturnsSectionStats = ({ stats, loading }) => {
    if (loading) {
        return (
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Returns</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCardSkeleton color="orange" />
                    <StatCardSkeleton color="orange" />
                    <StatCardSkeleton color="orange" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900">Returns</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                    label="Purchase Returns Value"
                    value={stats?.total_purchase_returns_value}
                    icon="🔄"
                    color="orange"
                />
                <StatCard
                    label="Customer Returns Value"
                    value={stats?.total_customer_returns_value}
                    icon="↩️"
                    color="orange"
                />
                <StatCard
                    label="Customer Returns COGS"
                    value={stats?.total_customer_returns_cogs}
                    icon="↩️"
                    color="orange"
                />
            </div>
        </div>
    );
};

ReturnsSectionStats.propTypes = {
    stats: PropTypes.object,
    loading: PropTypes.bool,
};

export default ReturnsSectionStats;
