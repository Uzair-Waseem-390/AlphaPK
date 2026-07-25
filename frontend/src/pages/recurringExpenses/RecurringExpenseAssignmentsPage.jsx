import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRecurringExpenseAssignments } from '../../hooks/useRecurringExpenses';
import { recurringExpensesApi } from '../../services/recurringExpensesApi';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import FilterBar from '../../components/ui/FilterBar';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const statusBadge = (status) => {
    if (status === 'paid') return <Badge variant="success" size="sm">Paid</Badge>;
    if (status === 'partial') return <Badge variant="warning" size="sm">Partial</Badge>;
    return <Badge variant="error" size="sm">Unpaid</Badge>;
};

const RecurringExpenseAssignmentsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const initialPeriod = location.state?.period;

    const {
        data: assignments, meta, page, setPage, loading, filters, setFilters,
    } = useRecurringExpenseAssignments(initialPeriod ? { period: initialPeriod } : {});

    const [categories, setCategories] = useState([]);
    const [showFilters, setShowFilters] = useState(!!initialPeriod);

    useEffect(() => {
        recurringExpensesApi.categories.getAll({ page_size: 500 }).then((res) => {
            setCategories(res?.results ?? res ?? []);
        });
    }, []);

    const handleApplyFilters = (values) => setFilters(values);
    const handleResetFilters = () => setFilters({});
    const handleRowClick = (row) => navigate(`/recurring-expenses/assignments/${row.id}`);

    const filterConfig = [
        { name: 'period', label: 'Month', type: 'month' },
        { name: 'category_id', label: 'Category', type: 'select', options: [
            { value: '', label: 'All' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
        ] },
        { name: 'payment_status', label: 'Status', type: 'select', options: [
            { value: '', label: 'All' },
            { value: 'unpaid', label: 'Unpaid' },
            { value: 'partial', label: 'Partial' },
            { value: 'paid', label: 'Paid' },
        ] },
    ];

    const columns = [
        { key: 'period', label: 'Period' },
        { key: 'name_snapshot', label: 'Name' },
        { key: 'category_name_snapshot', label: 'Category' },
        { key: 'amount', label: 'Amount (PKR)', render: (v) => `Rs. ${fmt(v)}` },
        { key: 'amount_paid', label: 'Paid (PKR)', render: (v) => <span className="text-success-600 font-semibold">Rs. {fmt(v)}</span> },
        { key: 'amount_pending', label: 'Pending (PKR)', render: (v) => parseFloat(v) > 0 ? <span className="text-warning-700 font-semibold">Rs. {fmt(v)}</span> : <span className="text-neutral-300">Rs. 0.00</span> },
        { key: 'payment_status', label: 'Status', render: (v) => statusBadge(v) },
    ];

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view recurring expense assignments.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <Link to="/recurring-expenses" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Recurring Expenses
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Assignments</h1>
                    <p className="text-neutral-500 mt-1">Every month due ever assigned — click one to record a payment.</p>
                </div>
                <Link to="/recurring-expenses/post-dues">
                    <Button>Post Dues →</Button>
                </Link>
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
            ) : assignments.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">📋</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Assignments Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">Post a month's dues to get started.</p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={assignments} onRowClick={handleRowClick} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}
        </div>
    );
};

export default RecurringExpenseAssignmentsPage;
