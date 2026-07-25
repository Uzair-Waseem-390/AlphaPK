import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRecurringExpenseMonthlyStats } from '../../hooks/useRecurringExpenses';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import Pagination from '../../components/ui/Pagination';
import Button from '../../components/ui/Button';
import FilterBar from '../../components/ui/FilterBar';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const RecurringExpenseMonthlyStatsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const {
        data: stats, meta, page, setPage, loading, filters, setFilters,
    } = useRecurringExpenseMonthlyStats();

    const [showFilters, setShowFilters] = useState(false);

    const handleApplyFilters = (values) => setFilters(values);
    const handleResetFilters = () => setFilters({});
    const handleRowClick = (row) => navigate('/recurring-expenses/assignments', { state: { period: row.period } });

    const filterConfig = [
        { name: 'is_fully_paid', label: 'Fully Paid', type: 'select', options: [
            { value: '', label: 'All' },
            { value: 'true', label: 'Fully Paid' },
            { value: 'false', label: 'Not Fully Paid' },
        ] },
    ];

    const columns = [
        { key: 'period', label: 'Month' },
        { key: 'total_assigned', label: 'Assigned (PKR)', render: (v) => <span className="font-semibold text-info-600">Rs. {fmt(v)}</span> },
        { key: 'total_paid', label: 'Paid (PKR)', render: (v) => <span className="font-semibold text-success-600">Rs. {fmt(v)}</span> },
        { key: 'total_pending', label: 'Pending (PKR)', render: (v) => parseFloat(v) > 0 ? <span className="font-semibold text-warning-700">Rs. {fmt(v)}</span> : <span className="text-neutral-300">Rs. 0.00</span> },
        {
            key: 'is_fully_paid',
            label: 'Status',
            render: (v) => v ? <Badge variant="success" size="sm">Fully Paid</Badge> : <Badge variant="warning" size="sm">Outstanding</Badge>,
        },
    ];

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view this.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <Link to="/recurring-expenses" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Recurring Expenses
                </Link>
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Monthly Breakdown</h1>
                <p className="text-neutral-500 mt-1">
                    Assigned, paid, and pending totals per month — synced, not computed on the fly.
                    A payment always counts toward the month it was assigned for, no matter when it was actually paid.
                </p>
            </div>

            <div className="flex gap-4">
                <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
                    {showFilters ? 'Hide Filters' : 'Show Filters'}
                </Button>
                {Object.keys(filters).length > 0 && (
                    <Button variant="secondary" onClick={handleResetFilters}>Clear Filters</Button>
                )}
            </div>
            {showFilters && (
                <FilterBar filters={filterConfig} onApply={handleApplyFilters} onReset={handleResetFilters} />
            )}

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : stats.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">📅</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No History Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">Post a month's dues to start building this breakdown.</p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={stats} onRowClick={handleRowClick} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}
        </div>
    );
};

export default RecurringExpenseMonthlyStatsPage;
