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

const filterConfig = [
    { name: 'date', label: 'Exact Date', type: 'date' },
    { name: 'date_from', label: 'Date From', type: 'date' },
    { name: 'date_to', label: 'Date To', type: 'date' },
];

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const columns = [
    { key: 'name_snapshot', label: 'Expense' },
    { key: 'category_name_snapshot', label: 'Category', render: (value) => <Badge>{value || 'N/A'}</Badge> },
    { key: 'period', label: 'For Month' },
    { key: 'amount', label: 'Amount (PKR)', render: fmt },
    { key: 'amount_paid', label: 'Paid (PKR)', render: fmt },
    { key: 'payment_status', label: 'Status', render: (value) => <Badge variant={value}>{value}</Badge> },
    { key: 'assigned_at', label: 'Assigned On', render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A' },
];

const RecurringExpensesReportPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [showFilters, setShowFilters] = useState(false);

    const {
        data: results, meta, extra, page, setPage, loading, error,
        filters, setFilters,
    } = usePaginatedList(reportsApi.recurringExpenses.get, {});

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
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Recurring Expenses Report</h1>
                <p className="text-neutral-500 mt-1">
                    Every recurring expense assignment — rent, salaries, utilities, etc. — for a selected
                    date or date range, filtered by when each bill was posted.
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Assignments</p>
                                <p className="text-2xl font-bold text-neutral-900">{stats.total_assignments}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Assigned (PKR)</p>
                                <p className="text-2xl font-bold text-neutral-900">{fmt(stats.total_assigned_amount)}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Paid (PKR)</p>
                                <p className="text-2xl font-bold text-success-600">{fmt(stats.total_paid_amount)}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Pending (PKR)</p>
                                <p className="text-2xl font-bold text-error-600">{fmt(stats.total_pending_amount)}</p>
                            </Card>
                        </div>
                    )}

                    {results.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4">🔁</div>
                            <h3 className="text-lg font-semibold text-neutral-900">No Assignments Found</h3>
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

export default RecurringExpensesReportPage;
