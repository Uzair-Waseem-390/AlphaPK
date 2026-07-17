import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsApi } from '../../services/reportsApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import FilterBar from '../../components/ui/FilterBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const filterConfig = [
    { name: 'date',      label: 'Exact Date', type: 'date' },
    { name: 'date_from', label: 'Date From',  type: 'date' },
    { name: 'date_to',   label: 'Date To',    type: 'date' },
];

const columns = [
    {
        key: 'reference_number',
        label: 'Reference #',
        width: '150px',
        render: (value) => <span className="font-mono text-sm font-medium text-neutral-800">{value}</span>,
    },
    { key: 'product_name', label: 'Product' },
    {
        key: 'product_code',
        label: 'Code',
        render: (value) => <span className="font-mono text-xs text-neutral-500">{value}</span>,
    },
    {
        key: 'reason',
        label: 'Reason',
        render: (value) => value
            ? <Badge variant="warning" size="sm">{value}</Badge>
            : <span className="text-neutral-300">—</span>,
    },
    {
        key: 'quantity',
        label: 'Lost Qty',
        render: (value) => <span className="font-semibold text-error-600">{value}</span>,
    },
    {
        key: 'found_quantity',
        label: 'Found Qty',
        render: (value) => value > 0
            ? <span className="font-semibold text-success-600">{value}</span>
            : <span className="text-neutral-300">—</span>,
    },
    {
        key: 'unit_cost',
        label: 'Unit Cost (PKR)',
        render: (value) => fmt(value),
    },
    {
        key: 'total_cost',
        label: 'Total Lost (PKR)',
        render: (value) => (
            <span className="font-semibold text-error-600">Rs. {fmt(value)}</span>
        ),
    },
    {
        key: 'recovered_amount',
        label: 'Recovered (PKR)',
        render: (value) => parseFloat(value) > 0
            ? <span className="font-semibold text-success-600">Rs. {fmt(value)}</span>
            : <span className="text-neutral-300">—</span>,
    },
    {
        key: 'net_amount',
        label: 'Net Loss (PKR)',
        render: (value) => (
            <span className="font-semibold text-warning-700">Rs. {fmt(value)}</span>
        ),
    },
    {
        key: 'created_at',
        label: 'Date',
        render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A',
    },
];

const LostInventoryReportPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [showFilters, setShowFilters] = useState(false);

    const {
        data: results, meta, extra, page, setPage, loading, error,
        filters, setFilters,
    } = usePaginatedList(reportsApi.lostInventory.get, {});

    const stats = extra?.stats;

    if (!isAdmin) {
        navigate('/dashboard');
        return null;
    }

    const handleApplyFilters = (filterValues) => setFilters(filterValues);
    const handleResetFilters = () => setFilters({});

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <Link to="/reports" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Reports
                </Link>
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Lost Inventory Report</h1>
                <p className="text-neutral-500 mt-1">
                    Products marked as lost, damaged, or missing — including partial or full recoveries
                </p>
            </div>

            {/* Filters */}
            <div className="space-y-4">
                <div className="flex gap-4">
                    <Button
                        variant="secondary"
                        onClick={() => setShowFilters(!showFilters)}
                        icon={({ className }) => (
                            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                        )}
                    >
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </Button>
                    {Object.keys(filters).length > 0 && (
                        <Button variant="secondary" onClick={handleResetFilters}>
                            Clear Filters
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
                    {/* Stats cards */}
                    {stats && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Card className="p-4">
                                <p className="text-xs text-neutral-500 mb-1">Total Lost Items</p>
                                <p className="text-2xl font-bold text-neutral-900">
                                    {stats.total_lost_items ?? 0}
                                </p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-xs text-neutral-500 mb-1">Total Lost Value (PKR)</p>
                                <p className="text-2xl font-bold text-error-600">
                                    Rs. {fmt(stats.total_lost_cash)}
                                </p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-xs text-neutral-500 mb-1">Recovered (PKR)</p>
                                <p className="text-2xl font-bold text-success-600">
                                    Rs. {fmt(stats.total_recovered_cash)}
                                </p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-xs text-neutral-500 mb-1">Net Loss (PKR)</p>
                                <p className="text-2xl font-bold text-warning-700">
                                    Rs. {fmt(stats.net_lost_cash)}
                                </p>
                            </Card>
                        </div>
                    )}

                    {/* Table */}
                    {results.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4">📉</div>
                            <h3 className="text-lg font-semibold text-neutral-900">No Lost Inventory Found</h3>
                            <p className="text-sm text-neutral-500 mt-1">
                                Try adjusting your date filters
                            </p>
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

export default LostInventoryReportPage;
