import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Building2, Briefcase, TrendingDown } from 'lucide-react';
import StatCard from './StatCard';
import StatCardSkeleton from './StatCardSkeleton';

const AssetsSectionStats = ({ stats, loading }) => {
    const navigate = useNavigate();
    const goToAssets = () => navigate('/assets');

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-blue-500 flex-shrink-0" />
                    <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">Fixed Assets</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCardSkeleton color="blue" />
                    <StatCardSkeleton color="purple" />
                    <StatCardSkeleton color="orange" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-blue-500 flex-shrink-0" />
                <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">Fixed Assets</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                    label="Total Asset Cost"
                    value={stats?.total_asset_cost}
                    icon={Building2}
                    color="blue"
                    subtitle="Active assets, at cost"
                    onClick={goToAssets}
                />
                <StatCard
                    label="Total Current Worth"
                    value={stats?.total_current_worth}
                    icon={Briefcase}
                    color="purple"
                    subtitle="Book value today"
                    onClick={goToAssets}
                />
                <StatCard
                    label="Accumulated Depreciation"
                    value={stats?.total_accumulated_depreciation}
                    icon={TrendingDown}
                    color="orange"
                    subtitle="Cost minus current worth"
                    onClick={goToAssets}
                />
            </div>
        </div>
    );
};

AssetsSectionStats.propTypes = {
    stats: PropTypes.object,
    loading: PropTypes.bool,
};

export default AssetsSectionStats;
