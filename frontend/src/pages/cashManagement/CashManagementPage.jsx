import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCashManagementStats } from '../../hooks/useCashManagement';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const StatBox = ({ label, value, tone = 'neutral', subtitle }) => {
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
            <p className={`text-xl font-bold ${tones[tone]}`}>Rs. {fmt(value)}</p>
            {subtitle && <p className="text-xs text-neutral-400 mt-1">{subtitle}</p>}
        </Card>
    );
};

const CashManagementPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data: stats, loading: statsLoading } = useCashManagementStats();

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view cash management.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-neutral-900">Cash Management</h1>
                <p className="text-neutral-500 mt-1">
                    Reconcile physical cash discrepancies and manage investor capital.
                </p>
            </div>

            {statsLoading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : (
                <>
                    <div>
                        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Cash Reconciliation</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <StatBox label="Total Cash Lost" value={stats?.total_cash_lost} tone="red" subtitle="All-time, gross" />
                            <StatBox label="Total Cash Recovered" value={stats?.total_cash_recovered} tone="green" subtitle="All-time, gross" />
                            <StatBox label="Net Cash Lost" value={stats?.net_cash_lost} tone="amber" subtitle="Lost minus recovered" />
                        </div>
                    </div>

                    <div>
                        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Investor Capital</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatBox label="Total Invested" value={stats?.total_investor_capital} tone="blue" subtitle="All-time, gross" />
                            <StatBox label="Total Withdrawn" value={stats?.total_investor_withdrawn} tone="orange" subtitle="All-time, gross" />
                            <StatBox label="Net Investor Capital" value={stats?.net_investor_capital} tone="purple" subtitle="Currently in the business" />
                            <StatBox label="Total Investor Net Worth" value={stats?.total_investor_net_worth} tone="green" subtitle="Theoretical, growth-compounded" />
                        </div>
                    </div>

                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                        Investor capital is equity financing — it increases cash in hand but is never counted as
                        revenue or profit. It's tracked separately so it can be used later to calculate each
                        investor's share once net (actual) profit is tracked, not just gross profit. Net Worth
                        includes each investor's compounded growth and is informational only — never used for
                        withdrawal validation.
                    </div>

                    <div>
                        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Owner Capital</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                            <StatBox label="Total Contributions" value={stats?.total_owner_contributions} tone="blue" subtitle="All-time, gross" />
                            <Card className="p-4">
                                <p className="text-xs text-neutral-500 mb-1">Number of Contributions</p>
                                <p className="text-xl font-bold text-neutral-900">{stats?.total_owner_contributions_count ?? 0}</p>
                                <p className="text-xs text-neutral-400 mt-1">All-time count</p>
                            </Card>
                            <StatBox label="Total Drawings" value={stats?.total_owner_drawings} tone="orange" subtitle="All-time, gross" />
                            <Card className="p-4">
                                <p className="text-xs text-neutral-500 mb-1">Number of Drawings</p>
                                <p className="text-xl font-bold text-neutral-900">{stats?.total_owner_withdrawals_count ?? 0}</p>
                                <p className="text-xs text-neutral-400 mt-1">All-time count</p>
                            </Card>
                            <StatBox
                                label="Net Owner Capital"
                                value={stats?.net_owner_capital}
                                tone={parseFloat(stats?.net_owner_capital) < 0 ? 'red' : 'purple'}
                                subtitle="Contributions minus drawings"
                            />
                        </div>
                    </div>

                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                        Owner drawings are not capped by contributions — the owner can draw out more than they've
                        deposited, financed by the business's profits. A negative net owner capital is normal.
                    </div>
                </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-2">Cash Adjustments</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Record cash that's been lost (theft, miscount, misplaced) or found/recovered.
                    </p>
                    <Link to="/cash-management/adjustments">
                        <Button variant="secondary">View Cash Adjustments →</Button>
                    </Link>
                </Card>
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-2">Investors</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Manage investors and record their investments and withdrawals.
                    </p>
                    <Link to="/cash-management/investors">
                        <Button variant="secondary">View Investors →</Button>
                    </Link>
                </Card>
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-2">Owner Transactions</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Record money the owner puts in or draws out of the business.
                    </p>
                    <Link to="/cash-management/owner-transactions">
                        <Button variant="secondary">View Owner Transactions →</Button>
                    </Link>
                </Card>
            </div>
        </div>
    );
};

export default CashManagementPage;
