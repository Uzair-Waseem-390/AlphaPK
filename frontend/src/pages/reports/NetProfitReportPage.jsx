import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsApi } from '../../services/reportsApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import FilterBar from '../../components/ui/FilterBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';

const filterConfig = [
    { name: 'date', label: 'Exact Date (within month)', type: 'date' },
    { name: 'date_from', label: 'Date From', type: 'date' },
    { name: 'date_to', label: 'Date To', type: 'date' },
];

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const formatMonthLabel = (period) => {
    if (!period) return '';
    const [year, m] = period.split('-');
    const date = new Date(Number(year), Number(m) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const columns = [
    { key: 'period', label: 'Month', render: formatMonthLabel },
    { key: 'gross_profit', label: 'Gross Profit (PKR)', render: fmt },
    { key: 'net_gross_profit', label: 'Net Gross Profit (PKR)', render: fmt },
    { key: 'expenses_paid', label: 'Expenses (PKR)', render: fmt },
    { key: 'recurring_expenses_paid', label: 'Recurring Exp. (PKR)', render: fmt },
    { key: 'gst_paid', label: 'GST Paid (PKR)', render: fmt },
    { key: 'wht_paid', label: 'WHT Paid (PKR)', render: fmt },
    { key: 'lost_inventory_net', label: 'Lost Inventory (PKR)', render: fmt },
    { key: 'lost_cash_net', label: 'Lost Cash (PKR)', render: fmt },
    { key: 'depreciation', label: 'Depreciation (PKR)', render: fmt },
    {
        key: 'disposal_gain_loss',
        label: 'Disposal Gain/Loss (PKR)',
        render: (v) => {
            const num = parseFloat(v);
            return <span className={num >= 0 ? 'text-success-600' : 'text-error-600'}>{fmt(v)}</span>;
        },
    },
    {
        key: 'net_profit',
        label: 'Net Profit (PKR)',
        render: (v) => {
            const num = parseFloat(v);
            return <span className={`font-semibold ${num >= 0 ? 'text-success-600' : 'text-error-600'}`}>{fmt(v)}</span>;
        },
    },
    { key: 'total_investor_share_amount', label: 'Investor Share (PKR)', render: fmt },
    { key: 'owner_share_amount', label: 'Owner Share (PKR)', render: fmt },
];

const NetProfitReportPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [showFilters, setShowFilters] = useState(false);

    const {
        data: results, meta, extra, page, setPage, loading, error,
        filters, setFilters,
    } = usePaginatedList(reportsApi.netProfit.get, {});

    const stats = extra?.stats;

    if (!isAdmin) {
        navigate('/dashboard');
        return null;
    }

    const handleApplyFilters = (filterValues) => setFilters(filterValues);
    const handleResetFilters = () => setFilters({});

    return (
        <div className="space-y-6">
            <div>
                <Link to="/reports" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Reports
                </Link>
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Net Profit Report</h1>
                <p className="text-neutral-500 mt-1">
                    "Real" profit per finalized month — gross profit minus expenses, taxes, losses, and
                    depreciation — for a selected date or date range. The current, still-open month never
                    appears here; see Monthly Profits for its live provisional figures.
                </p>
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </Button>
                    {Object.keys(filters).length > 0 && (
                        <Button variant="secondary" onClick={handleResetFilters}>
                            Clear All
                        </Button>
                    )}
                </div>

                {showFilters && (
                    <FilterBar
                        filters={filterConfig}
                        onApply={handleApplyFilters}
                        onReset={handleResetFilters}
                    />
                )}
            </div>

            {error && (
                <div className="p-4 bg-error-50 border border-error-200 rounded-lg">
                    <p className="text-sm text-error-600">{error}</p>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center min-h-[40vh]">
                    <LoadingSpinner size="lg" />
                </div>
            ) : (
                <>
                    {stats && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Months</p>
                                <p className="text-2xl font-bold text-neutral-900">{stats.total_months}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Gross Profit (PKR)</p>
                                <p className="text-2xl font-bold text-neutral-900">{fmt(stats.total_gross_profit)}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Net Gross Profit (PKR)</p>
                                <p className="text-2xl font-bold text-neutral-900">{fmt(stats.total_net_gross_profit)}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Net Profit (PKR)</p>
                                <p className={`text-2xl font-bold ${Number(stats.total_net_profit || 0) >= 0 ? 'text-success-600' : 'text-error-600'}`}>
                                    {fmt(stats.total_net_profit)}
                                </p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Investor Share (PKR)</p>
                                <p className="text-2xl font-bold text-info-600">{fmt(stats.total_investor_share)}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Owner Share (PKR)</p>
                                <p className="text-2xl font-bold text-primary-600">{fmt(stats.total_owner_share)}</p>
                            </Card>
                        </div>
                    )}

                    {results.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4">📈</div>
                            <h3 className="text-lg font-semibold text-neutral-900">No Finalized Months Found</h3>
                            <p className="text-sm text-neutral-500 mt-1">Try adjusting your date filters</p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <Table columns={columns} data={results} />
                            </div>
                            {meta.totalPages > 1 && (
                                <Pagination
                                    currentPage={meta.currentPage}
                                    totalPages={meta.totalPages}
                                    onPageChange={setPage}
                                />
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default NetProfitReportPage;
