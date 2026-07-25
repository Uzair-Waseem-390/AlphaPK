import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRecurringExpensePendingDues } from '../../hooks/useRecurringExpenses';
import { recurringExpensesApi } from '../../services/recurringExpensesApi';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const currentMonth = () => new Date().toISOString().slice(0, 7);

const RecurringExpensePostDuesPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [period, setPeriod] = useState(currentMonth());
    const [categoryId, setCategoryId] = useState('');
    const [categories, setCategories] = useState([]);

    const {
        data: pending, meta, page, setPage, loading, refetch, setFilters,
    } = useRecurringExpensePendingDues({ period });

    // usePaginatedList only reads its initialFilters argument once, on mount —
    // period/categoryId change interactively here, so they must be pushed via
    // setFilters explicitly or the list would silently stop updating.
    useEffect(() => {
        setFilters(categoryId ? { period, category_id: categoryId } : { period });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period, categoryId]);

    const [assigningId, setAssigningId] = useState(null);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [actionError, setActionError] = useState('');
    const [bulkResult, setBulkResult] = useState(null);

    useEffect(() => {
        recurringExpensesApi.categories.getAll({ page_size: 500 }).then((res) => {
            setCategories(res?.results ?? res ?? []);
        });
    }, []);

    const handlePeriodChange = (value) => {
        setPeriod(value);
        setBulkResult(null);
    };

    const handleCategoryChange = (value) => {
        setCategoryId(value);
        setBulkResult(null);
    };

    const handleAssignOne = async (templateId) => {
        setActionError('');
        setAssigningId(templateId);
        try {
            await recurringExpensesApi.assignments.create({ recurring_expense: templateId, period });
            await refetch();
        } catch (error) {
            setActionError(error.response?.data?.period?.[0] || error.response?.data?.detail || 'Failed to assign');
        } finally {
            setAssigningId(null);
        }
    };

    const handleBulkAssign = async () => {
        setActionError('');
        setBulkResult(null);
        setBulkLoading(true);
        try {
            const payload = { period, ...(categoryId ? { category_id: categoryId } : {}) };
            const result = await recurringExpensesApi.assignments.bulkCreate(payload);
            setBulkResult(result);
            await refetch();
        } catch (error) {
            setActionError(error.response?.data?.detail || 'Failed to bulk-assign');
        } finally {
            setBulkLoading(false);
        }
    };

    const columns = [
        { key: 'name', label: 'Name' },
        { key: 'category_name', label: 'Category' },
        { key: 'amount', label: 'Amount (PKR)', render: (v) => <span className="font-semibold text-info-600">Rs. {fmt(v)}</span> },
        {
            key: 'actions',
            label: 'Actions',
            width: '120px',
            render: (_v, row) => (
                <Button size="sm" loading={assigningId === row.id} onClick={() => handleAssignOne(row.id)}>
                    Post
                </Button>
            ),
        },
    ];

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can post recurring expense dues.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <Link to="/recurring-expenses" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Recurring Expenses
                </Link>
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Post Dues</h1>
                <p className="text-neutral-500 mt-1">
                    Assigning a month's due never moves cash by itself — it only becomes a payable balance.
                    Record an actual payment from the Assignments page once it's paid.
                </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-end p-4 bg-neutral-50 rounded-xl">
                <Input
                    label="Month"
                    type="month"
                    value={period}
                    onChange={(e) => handlePeriodChange(e.target.value)}
                    className="w-48"
                />
                <Select
                    label="Category (optional)"
                    value={categoryId}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    options={categories.map((c) => ({ value: c.id, label: c.name }))}
                    placeholder="All categories"
                    className="w-56"
                />
                <Button loading={bulkLoading} onClick={handleBulkAssign} disabled={pending.length === 0}>
                    {categoryId ? `Post All in Category` : 'Post All Due'}
                </Button>
            </div>

            {actionError && (
                <div className="p-3 bg-error-50 border border-error-200 rounded-lg">
                    <p className="text-sm text-error-600">{actionError}</p>
                </div>
            )}

            {bulkResult && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                    Posted {bulkResult.created?.length ?? 0} due{bulkResult.created?.length === 1 ? '' : 's'} for {period}.
                    {bulkResult.failed?.length > 0 && (
                        <span className="text-error-600"> {bulkResult.failed.length} failed: {bulkResult.failed.map((f) => f.name).join(', ')}.</span>
                    )}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : pending.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">✅</div>
                    <h3 className="text-lg font-semibold text-neutral-900">Nothing Due</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                        Every active recurring expense{categoryId ? ' in this category' : ''} has already been assigned for {period}.
                    </p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={pending} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}
        </div>
    );
};

export default RecurringExpensePostDuesPage;
