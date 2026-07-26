import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMonthlyProfits, useCurrentMonthProfit, useProfitFlowStats } from '../../hooks/useProfits';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const formatMonthLabel = (period) => {
    if (!period) return '';
    const [year, m] = period.split('-');
    const date = new Date(Number(year), Number(m) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const StatBox = ({ label, value, tone = 'neutral', subtitle }) => {
    const tones = {
        neutral: 'text-neutral-900',
        green: 'text-success-600',
        red: 'text-error-600',
        blue: 'text-info-600',
    };
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    const resolvedTone = tone === 'auto' ? (num >= 0 ? 'green' : 'red') : tone;
    return (
        <Card className="p-4">
            <p className="text-xs text-neutral-500 mb-1">{label}</p>
            <p className={`text-xl font-bold ${tones[resolvedTone]}`}>Rs. {fmt(value)}</p>
            {subtitle && <p className="text-xs text-neutral-400 mt-1">{subtitle}</p>}
        </Card>
    );
};

const MonthlyProfitsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data: months, meta, page, setPage, loading } = useMonthlyProfits();
    const { data: current, loading: currentLoading } = useCurrentMonthProfit();
    const { data: stats, loading: statsLoading } = useProfitFlowStats();

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view monthly profits.</p>
            </div>
        );
    }

    const columns = [
        { key: 'period', label: 'Month', render: (v) => formatMonthLabel(v) },
        { key: 'gross_profit', label: 'Gross Profit (PKR)', render: (v) => `Rs. ${fmt(v)}` },
        { key: 'net_gross_profit', label: 'Net Gross Profit (PKR)', render: (v) => `Rs. ${fmt(v)}` },
        {
            key: 'net_profit',
            label: 'Net Profit (PKR)',
            render: (v) => {
                const num = parseFloat(v);
                return <span className={`font-semibold ${num >= 0 ? 'text-success-600' : 'text-error-600'}`}>Rs. {fmt(v)}</span>;
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-neutral-900">Monthly Profits</h1>
                <p className="text-neutral-500 mt-1">
                    "Real" profit per month — gross profit minus expenses, taxes, losses, and depreciation —
                    split between investors and the owner.
                </p>
            </div>

            {/* Lifetime totals */}
            {statsLoading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatBox label="Lifetime Net Profit" value={stats?.total_net_profit} tone="auto" subtitle={`${stats?.months_finalized_count ?? 0} months finalized`} />
                    <StatBox label="Total Investor Share" value={stats?.total_investor_profit_share} tone="blue" />
                    <StatBox label="Total Paid Out" value={stats?.total_paid_out_to_investors} tone="green" subtitle="To investors, all-time" />
                    <StatBox label="Total Reinvested" value={stats?.total_reinvested_by_investors} tone="green" subtitle="By investors, all-time" />
                </div>
            )}

            {/* Current, provisional month */}
            <Card className="p-6 border-2 border-dashed border-amber-300 bg-amber-50/40">
                <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-semibold text-neutral-900">
                        {current ? formatMonthLabel(current.period) : 'Current Month'}
                    </h3>
                    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        In progress — provisional
                    </span>
                </div>
                {currentLoading ? (
                    <LoadingSpinner size="md" />
                ) : (
                    <>
                        <p className="text-sm text-neutral-500 mb-3">
                            Still accumulating — expenses, taxes, and other figures aren't final until the month ends.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div>
                                <p className="text-xs text-neutral-500">Net Gross Profit (so far)</p>
                                <p className="text-lg font-bold text-neutral-900">Rs. {fmt(current?.net_gross_profit)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-neutral-500">Deductions (so far)</p>
                                <p className="text-lg font-bold text-neutral-900">
                                    Rs. {fmt(
                                        (parseFloat(current?.expenses_paid || 0)) +
                                        (parseFloat(current?.recurring_expenses_paid || 0)) +
                                        (parseFloat(current?.gst_paid || 0)) +
                                        (parseFloat(current?.wht_paid || 0)) +
                                        (parseFloat(current?.lost_inventory_net || 0)) +
                                        (parseFloat(current?.lost_cash_net || 0)) +
                                        (parseFloat(current?.depreciation || 0)) -
                                        (parseFloat(current?.disposal_gain_loss || 0))
                                    )}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-neutral-500">Net Profit (so far)</p>
                                <p className={`text-lg font-bold ${parseFloat(current?.net_profit || 0) >= 0 ? 'text-success-600' : 'text-error-600'}`}>
                                    Rs. {fmt(current?.net_profit)}
                                </p>
                            </div>
                        </div>
                        <div className="mt-4">
                            <Button size="sm" variant="secondary" onClick={() => navigate('/monthly-profits/current')}>
                                View Full Breakdown →
                            </Button>
                        </div>
                    </>
                )}
            </Card>

            {/* Finalized months */}
            <div>
                <h2 className="text-lg font-semibold text-neutral-900 mb-3">Finalized Months</h2>
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : months.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-6xl mb-4">📈</div>
                        <h3 className="text-lg font-semibold text-neutral-900">No Finalized Months Yet</h3>
                        <p className="text-sm text-neutral-500 mt-1">
                            A month finalizes automatically once it's fully over.
                        </p>
                    </div>
                ) : (
                    <>
                        <Table columns={columns} data={months} onRowClick={(row) => navigate(`/monthly-profits/${row.period}`)} />
                        {meta.totalPages > 1 && (
                            <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default MonthlyProfitsPage;
