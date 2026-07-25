import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRecurringExpenseFlowStats } from '../../hooks/useRecurringExpenses';
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

const RecurringExpensesPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data: stats, loading: statsLoading } = useRecurringExpenseFlowStats();

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view recurring expenses.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-neutral-900">Recurring Expenses</h1>
                <p className="text-neutral-500 mt-1">
                    Salaries, rent, and anything else that must be paid every month — assign what's due,
                    then record payments as they're actually made.
                </p>
            </div>

            {statsLoading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <StatBox label="Total Assigned" value={stats?.total_assigned_amount} tone="blue" subtitle="All-time, gross" />
                        <StatBox label="Total Paid" value={stats?.total_paid_amount} tone="green" subtitle="All-time" />
                        <StatBox label="Total Pending" value={stats?.total_pending_amount} tone="amber" subtitle="Assigned minus paid" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <StatBox label="Active Templates" value={stats?.total_active_templates} tone="neutral" subtitle="Currently active" isCount />
                        <StatBox label="Active Monthly Obligation" value={stats?.total_active_monthly_obligation} tone="purple" subtitle="If everything were assigned this month" />
                        <StatBox label="Total Assignments" value={stats?.total_assignments_count} tone="neutral" subtitle="All-time count" isCount />
                    </div>
                </>
            )}

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                Assigning a month's due never moves cash by itself — it only becomes a payable balance.
                Cash in hand only changes when a payment is actually recorded against it.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-2">Categories</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Set up categories like Rent, Salaries, Utilities.
                    </p>
                    <Link to="/recurring-expenses/categories">
                        <Button variant="secondary">View Categories →</Button>
                    </Link>
                </Card>
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-2">Templates</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Manage each recurring obligation and its monthly amount.
                    </p>
                    <Link to="/recurring-expenses/templates">
                        <Button variant="secondary">View Templates →</Button>
                    </Link>
                </Card>
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-2">Post Dues</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Assign what's due for a month — one at a time, all at once, or by category.
                    </p>
                    <Link to="/recurring-expenses/post-dues">
                        <Button>Post Dues →</Button>
                    </Link>
                </Card>
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-2">Assignments</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Every month due ever assigned — record payments here.
                    </p>
                    <Link to="/recurring-expenses/assignments">
                        <Button variant="secondary">View Assignments →</Button>
                    </Link>
                </Card>
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-2">Monthly Breakdown</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Assigned/paid/pending totals per month, at a glance.
                    </p>
                    <Link to="/recurring-expenses/monthly-stats">
                        <Button variant="secondary">View Breakdown →</Button>
                    </Link>
                </Card>
            </div>
        </div>
    );
};

export default RecurringExpensesPage;
