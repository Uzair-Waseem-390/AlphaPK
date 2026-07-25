import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAssetStats } from '../../hooks/useAssets';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const StatBox = ({ label, value, tone = 'neutral', subtitle, isCount = false }) => {
    const tones = {
        neutral: 'text-neutral-900',
        amber: 'text-warning-700',
        red: 'text-error-600',
        blue: 'text-info-600',
        purple: 'text-purple-600',
        green: 'text-success-600',
        orange: 'text-orange-600',
    };
    return (
        <Card className="p-4">
            <p className="text-xs text-neutral-500 mb-1">{label}</p>
            <p className={`text-xl font-bold ${tones[tone]}`}>
                {isCount ? (value ?? 0) : `Rs. ${fmt(value)}`}
            </p>
            {subtitle && <p className="text-xs text-neutral-400 mt-1">{subtitle}</p>}
        </Card>
    );
};

const AssetsPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data: stats, loading: statsLoading } = useAssetStats();

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view assets.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-neutral-900">Fixed Assets</h1>
                <p className="text-neutral-500 mt-1">
                    Track equipment, vehicles, and land — depreciation and revaluation, computed automatically.
                </p>
            </div>

            {statsLoading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <StatBox label="Total Asset Cost" value={stats?.total_asset_cost} tone="blue" subtitle="Active assets, at cost" />
                        <StatBox label="Total Current Worth" value={stats?.total_current_worth} tone="purple" subtitle="Book value today" />
                        <StatBox label="Accumulated Depreciation" value={stats?.total_accumulated_depreciation} tone="orange" subtitle="Cost minus current worth" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <StatBox label="Assets Disposed" value={stats?.total_disposed_count} tone="neutral" subtitle="Scrapped + sold, all-time" isCount />
                        <StatBox label="Total Gain on Disposal" value={stats?.total_gain_on_disposal} tone="green" subtitle="Sold above book value" />
                        <StatBox label="Total Loss on Disposal" value={stats?.total_loss_on_disposal} tone="red" subtitle="Sold below book value" />
                    </div>
                </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-2">Categories</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Set up depreciation or revaluation categories (e.g. Furniture 15%, Land — revaluation).
                    </p>
                    <Link to="/assets/categories">
                        <Button variant="secondary">View Categories →</Button>
                    </Link>
                </Card>
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-2">Assets</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Register existing or newly purchased assets and track their worth over time.
                    </p>
                    <Link to="/assets/items">
                        <Button variant="secondary">View Assets →</Button>
                    </Link>
                </Card>
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-2">Disposals</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Audit trail of every asset that's been scrapped or sold.
                    </p>
                    <Link to="/assets/disposals">
                        <Button variant="secondary">View Disposals →</Button>
                    </Link>
                </Card>
            </div>
        </div>
    );
};

export default AssetsPage;
