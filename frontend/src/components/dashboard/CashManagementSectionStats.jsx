import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Wallet, Search, Handshake, TrendingUp, LineChart } from 'lucide-react';
import StatCard from './StatCard';
import StatCardSkeleton from './StatCardSkeleton';

const CashManagementSectionStats = ({ stats, loading }) => {
    const navigate = useNavigate();
    const goToCashManagement = () => navigate('/cash-management');

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-purple-500 flex-shrink-0" />
                    <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">Cash Management</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <StatCardSkeleton color="red" />
                    <StatCardSkeleton color="green" />
                    <StatCardSkeleton color="blue" />
                    <StatCardSkeleton color="purple" />
                    <StatCardSkeleton color="green" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-purple-500 flex-shrink-0" />
                <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">Cash Management</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard
                    label="Net Cash Lost"
                    value={stats?.net_cash_lost}
                    icon={Wallet}
                    color="red"
                    subtitle="Lost minus recovered"
                    onClick={goToCashManagement}
                />
                <StatCard
                    label="Cash Recovered"
                    value={stats?.total_cash_recovered}
                    icon={Search}
                    color="green"
                    subtitle="All-time"
                    onClick={goToCashManagement}
                />
                <StatCard
                    label="Investor Capital"
                    value={stats?.net_investor_capital}
                    icon={Handshake}
                    color="purple"
                    subtitle="Currently in the business"
                    onClick={goToCashManagement}
                />
                <StatCard
                    label="Total Invested"
                    value={stats?.total_investor_capital}
                    icon={TrendingUp}
                    color="blue"
                    subtitle="All-time, gross"
                    onClick={goToCashManagement}
                />
                <StatCard
                    label="Investor Net Worth"
                    value={stats?.total_investor_net_worth}
                    icon={LineChart}
                    color="green"
                    subtitle="Theoretical, growth-compounded"
                    onClick={goToCashManagement}
                />
            </div>
        </div>
    );
};

CashManagementSectionStats.propTypes = {
    stats: PropTypes.object,
    loading: PropTypes.bool,
};

export default CashManagementSectionStats;
