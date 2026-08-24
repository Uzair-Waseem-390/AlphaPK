import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Banknote, Hourglass, Repeat } from 'lucide-react';
import StatCard from './StatCard';
import StatCardSkeleton from './StatCardSkeleton';

const RecurringExpensesSectionStats = ({ stats, loading }) => {
    const navigate = useNavigate();
    const goToRecurringExpenses = () => navigate('/recurring-expenses');

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-purple-500 flex-shrink-0" />
                    <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">Recurring Expenses</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCardSkeleton color="green" />
                    <StatCardSkeleton color="amber" />
                    <StatCardSkeleton color="purple" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-purple-500 flex-shrink-0" />
                <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">Recurring Expenses</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                    label="Total Paid"
                    value={stats?.total_paid_amount}
                    icon={Banknote}
                    color="green"
                    subtitle="All-time"
                    onClick={goToRecurringExpenses}
                />
                <StatCard
                    label="Total Pending"
                    value={stats?.total_pending_amount}
                    icon={Hourglass}
                    color="amber"
                    subtitle="Assigned minus paid"
                    onClick={goToRecurringExpenses}
                />
                <StatCard
                    label="Active Monthly Obligation"
                    value={stats?.total_active_monthly_obligation}
                    icon={Repeat}
                    color="purple"
                    subtitle="If everything were assigned this month"
                    onClick={goToRecurringExpenses}
                />
            </div>
        </div>
    );
};

RecurringExpensesSectionStats.propTypes = {
    stats: PropTypes.object,
    loading: PropTypes.bool,
};

export default RecurringExpensesSectionStats;
