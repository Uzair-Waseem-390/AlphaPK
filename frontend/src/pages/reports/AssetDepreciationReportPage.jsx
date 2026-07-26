import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsApi } from '../../services/reportsApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { printReport } from '../../utils/print';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
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
    { key: 'asset_name', label: 'Asset' },
    { key: 'category_name', label: 'Category', render: (value) => <Badge>{value || 'N/A'}</Badge> },
    { key: 'period', label: 'For Month', render: formatMonthLabel },
    { key: 'rate_applied', label: 'Rate', render: (v) => v != null ? `${(parseFloat(v) * 100).toFixed(2)}%` : 'N/A' },
    { key: 'worth_before', label: 'Worth Before (PKR)', render: fmt },
    { key: 'worth_after', label: 'Worth After (PKR)', render: fmt },
    {
        key: 'amount',
        label: 'Depreciation (PKR)',
        render: (v) => <span className="text-error-600 font-medium">− Rs. {fmt(Math.abs(parseFloat(v)))}</span>,
    },
    { key: 'created_at', label: 'Posted On', render: (v) => v ? new Date(v).toLocaleDateString() : 'N/A' },
];

const AssetDepreciationReportPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [showFilters, setShowFilters] = useState(false);
    const [printing, setPrinting] = useState(false);

    const {
        data: results, meta, extra, page, setPage, loading, error,
        filters, setFilters,
    } = usePaginatedList(reportsApi.assetDepreciation.get, {});

    const stats = extra?.stats;

    if (!isAdmin) {
        navigate('/dashboard');
        return null;
    }

    const handleApplyFilters = (filterValues) => setFilters(filterValues);
    const handleResetFilters = () => setFilters({});

    const handlePrint = async () => {
        setPrinting(true);
        try {
            await printReport('/reports/asset-depreciation/print/', filters);
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
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Asset Depreciation Report</h1>
                <p className="text-neutral-500 mt-1">
                    Every depreciation posting across all assets, for a selected date or date range — the
                    figure that silently feeds into Monthly Profit each month.
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Entries</p>
                                <p className="text-2xl font-bold text-neutral-900">{stats.total_entries}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Depreciation (PKR)</p>
                                <p className="text-2xl font-bold text-error-600">{fmt(stats.total_depreciation)}</p>
                            </Card>
                        </div>
                    )}

                    {results.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4">📉</div>
                            <h3 className="text-lg font-semibold text-neutral-900">No Depreciation Postings Found</h3>
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

export default AssetDepreciationReportPage;
