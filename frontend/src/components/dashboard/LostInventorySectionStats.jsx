import PropTypes from 'prop-types';
import { TrendingDown, Search, AlertTriangle } from 'lucide-react';
import StatCard from './StatCard';
import StatCardSkeleton from './StatCardSkeleton';

const LostInventorySectionStats = ({ stats, loading, onCardClick }) => {
    if (loading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-red-500 flex-shrink-0" />
                    <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">Lost Inventory</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCardSkeleton color="red" />
                    <StatCardSkeleton color="green" />
                    <StatCardSkeleton color="orange" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-red-500 flex-shrink-0" />
                <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">Lost Inventory</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                    label="Total Lost (Gross)"
                    value={stats?.total_lost_inventory_worth}
                    icon={TrendingDown}
                    color="red"
                    onClick={() => onCardClick('lostInventory', 'Lost Inventory Breakdown')}
                />
                <StatCard
                    label="Recovered (Found)"
                    value={stats?.total_lost_inventory_recovered}
                    icon={Search}
                    color="green"
                    onClick={() => onCardClick('lostInventory', 'Lost Inventory Breakdown')}
                />
                <StatCard
                    label="Net Lost Worth"
                    value={stats?.net_lost_inventory_worth}
                    icon={AlertTriangle}
                    color="orange"
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
