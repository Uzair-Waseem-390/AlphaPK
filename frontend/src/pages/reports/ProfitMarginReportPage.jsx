import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsApi } from '../../services/reportsApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { printReport } from '../../utils/print';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import FilterBar from '../../components/ui/FilterBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';

const filterConfig = [
    { name: 'date', label: 'Exact Date', type: 'date' },
    { name: 'date_from', label: 'Date From', type: 'date' },
    { name: 'date_to', label: 'Date To', type: 'date' },
];

const formatCurrency = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const columns = [
    { key: 'bill_number', label: 'Bill #', width: '140px' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'grand_total', label: 'Revenue (PKR)', render: formatCurrency },
    { key: 'total_cogs', label: 'COGS (PKR)', render: formatCurrency },
    {
        key: 'gross_profit',
        label: 'Gross Profit (PKR)',
        render: (value) => {
            const num = typeof value === 'string' ? parseFloat(value) : value;
            const formatted = isNaN(num) ? '0.00' : num.toFixed(2);
            return <span className={num >= 0 ? 'text-success-600' : 'text-error-600'}>{formatted}</span>;
        },
    },
    {
        key: 'margin_percent',
        label: 'Margin %',
        render: (value) => {
            const num = typeof value === 'string' ? parseFloat(value) : value;
            return isNaN(num) ? '0.00%' : `${num.toFixed(2)}%`;
        },
    },
    {
        key: 'confirmed_at',
        label: 'Date',
        render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A',
    },
];

const ProfitMarginReportPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [showFilters, setShowFilters] = useState(false);
    const [printing, setPrinting] = useState(false);

    const {
        data: results, meta, extra, page, setPage, loading, error,
        filters, setFilters,
    } = usePaginatedList(reportsApi.profitMargin.get, {});

    // Stats are computed server-side over the full filtered set (not just
    // the current page) and passed through as an extra top-level field.
    // total_revenue/total_cogs/total_gross_profit are GROSS — the historical
    // "as sold" figures, never reduced by returns. net_revenue/net_cogs/
    // net_gross_profit subtract returns accepted within the same window
    // (not floored — a narrow window can legitimately show a net loss).
    const stats = extra?.stats;
    const netRevenue = Number(stats?.net_revenue ?? stats?.total_revenue ?? 0);
    const netMargin = netRevenue > 0
        ? (Number(stats?.net_gross_profit ?? 0) / netRevenue) * 100
        : 0;

    if (!isAdmin) {
        navigate('/dashboard');
        return null;
    }

    const handleApplyFilters = (filterValues) => setFilters(filterValues);
    const handleResetFilters = () => setFilters({});

    const handlePrint = async () => {
        setPrinting(true);
        try {
            await printReport('/reports/profit-margin/print/', filters);
        } catch (err) {
            alert(err.message || 'Failed to print report');
        } finally {
            setPrinting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <Link to="/reports" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Reports
                </Link>
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Profit / Margin Report</h1>
                <p className="text-neutral-500 mt-1">
                    Net figures subtract returns accepted in the same window; gross figures shown below them are the original "as sold" totals.
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
                    <Button variant="secondary" onClick={handlePrint} loading={printing}>
                        Print
                    </Button>
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
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Invoices</p>
                                <p className="text-2xl font-bold text-neutral-900">{stats.total_invoices}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Net Revenue (PKR)</p>
                                <p className="text-2xl font-bold text-neutral-900">
                                    {Number(stats.net_revenue ?? stats.total_revenue ?? 0).toFixed(2)}
                                </p>
                                <p className="text-xs text-neutral-400 mt-1">
                                    Before returns: {Number(stats.total_revenue || 0).toFixed(2)}
                                </p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Net COGS (PKR)</p>
                                <p className="text-2xl font-bold text-neutral-900">
                                    {Number(stats.net_cogs ?? stats.total_cogs ?? 0).toFixed(2)}
                                </p>
                                <p className="text-xs text-neutral-400 mt-1">
                                    Before returns: {Number(stats.total_cogs || 0).toFixed(2)}
                                </p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Net Gross Profit (PKR)</p>
                                <p className={`text-2xl font-bold ${Number(stats.net_gross_profit ?? stats.total_gross_profit ?? 0) >= 0 ? 'text-success-600' : 'text-error-600'}`}>
                                    {Number(stats.net_gross_profit ?? stats.total_gross_profit ?? 0).toFixed(2)}
                                </p>
                                <p className="text-xs text-neutral-400 mt-1">
                                    {netMargin.toFixed(2)}% margin · Gross (before returns): {Number(stats.total_gross_profit || 0).toFixed(2)}
                                </p>
                            </Card>
                        </div>
                    )}

                    {results.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4">📈</div>
                            <h3 className="text-lg font-semibold text-neutral-900">No Invoices Found</h3>
                            <p className="text-sm text-neutral-500 mt-1">Try adjusting your date filters</p>
                        </div>
                    ) : (
                        <>
                            <Table columns={columns} data={results} />
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

export default ProfitMarginReportPage;
