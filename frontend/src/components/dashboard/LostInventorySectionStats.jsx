import PropTypes from 'prop-types';
import StatCard from './StatCard';
import StatCardSkeleton from './StatCardSkeleton';

const LostInventorySectionStats = ({ stats, loading, onCardClick }) => {
    if (loading) {
        return (
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Lost Inventory</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <StatCardSkeleton color="red" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900">Lost Inventory</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard
                    label="Lost Inventory Worth"
                    value={stats?.total_lost_inventory_worth}
                    icon="📉"
                    color="red"
                    onClick={() => onCardClick('lostInventory', 'Lost Inventory Breakdown')}
                />
            </div>
        </div>
    );
};

LostInventorySectionStats.propTypes = {
    stats: PropTypes.object,
    loading: PropTypes.bool,
    onCardClick: PropTypes.func.isRequired,
};

export default LostInventorySectionStats;
