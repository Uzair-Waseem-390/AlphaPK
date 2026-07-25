import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRecurringExpenseTemplates } from '../../hooks/useRecurringExpenses';
import { recurringExpensesApi } from '../../services/recurringExpensesApi';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import FilterBar from '../../components/ui/FilterBar';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const emptyForm = { name: '', category: '', amount: '', start_date: new Date().toISOString().split('T')[0], note: '' };

const RecurringExpenseTemplatesPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const {
        data: templates, meta, page, setPage, loading, filters, setFilters,
        refetch, create, update, delete: deleteTemplate,
    } = useRecurringExpenseTemplates();

    const [categories, setCategories] = useState([]);
    const [showFilters, setShowFilters] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [formData, setFormData] = useState(emptyForm);
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        recurringExpensesApi.categories.getAll({ page_size: 500 }).then((res) => {
            setCategories(res?.results ?? res ?? []);
        });
    }, []);

    const resetForm = () => {
        setFormData(emptyForm);
        setEditingTemplate(null);
        setFormError('');
    };

    const handleApplyFilters = (values) => setFilters(values);
    const handleResetFilters = () => setFilters({});

    const filterConfig = [
        { name: 'category_id', label: 'Category', type: 'select', options: [
            { value: '', label: 'All' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
        ] },
        { name: 'is_active', label: 'Status', type: 'select', options: [
            { value: '', label: 'All' },
            { value: 'true', label: 'Active' },
            { value: 'false', label: 'Inactive' },
        ] },
    ];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormLoading(true);
        try {
            const payload = { ...formData, amount: parseFloat(formData.amount) };
            if (editingTemplate) {
                await update(editingTemplate.id, payload);
            } else {
                await create(payload);
            }
            setShowModal(false);
            resetForm();
            refetch();
        } catch (error) {
            setFormError(error.response?.data?.detail || error.response?.data?.name?.[0] || error.response?.data?.amount?.[0] || 'Failed to save recurring expense');
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = (template) => {
        setEditingTemplate(template);
        setFormData({
            name: template.name,
            category: template.category,
            amount: template.amount,
            start_date: template.start_date,
            note: template.note || '',
        });
        setShowModal(true);
    };

    const handleToggleActive = async (template) => {
        try {
            await update(template.id, { is_active: !template.is_active });
            refetch();
        } catch (error) {
            alert(error.response?.data?.detail || 'Failed to update status');
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteTemplate(id);
            setDeleteConfirm(null);
            refetch();
        } catch (error) {
            setDeleteConfirm(null);
            alert(error.response?.data?.detail || 'Failed to delete recurring expense');
        }
    };

    const columns = [
        { key: 'name', label: 'Name' },
        { key: 'category_name', label: 'Category' },
        { key: 'amount', label: 'Monthly Amount (PKR)', render: (v) => <span className="font-semibold text-info-600">Rs. {fmt(v)}</span> },
        { key: 'start_date', label: 'Start Date', render: (v) => new Date(v).toLocaleDateString() },
        {
            key: 'is_active',
            label: 'Status',
            render: (v, row) => (
                <button onClick={() => handleToggleActive(row)}>
                    {v ? <Badge variant="success" size="sm">Active</Badge> : <Badge size="sm">Inactive</Badge>}
                </button>
            ),
        },
        {
            key: 'actions',
            label: 'Actions',
            width: '150px',
            render: (_v, row) => (
                <div className="flex gap-2">
                    <button onClick={() => handleEdit(row)} className="text-primary-600 hover:text-primary-700 text-sm">
                        Edit
                    </button>
                    <button onClick={() => setDeleteConfirm(row)} className="text-error-600 hover:text-error-700 text-sm">
                        Delete
                    </button>
                </div>
            ),
        },
    ];

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view recurring expenses.</p>
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
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Recurring Expense Templates</h1>
                    <p className="text-neutral-500 mt-1">
                        Salaries, rent, and anything else that recurs monthly. Creating one here never moves cash by itself —
                        use Post Dues to assign a month, then record a payment against it.
                    </p>
                </div>
                <Button onClick={() => { resetForm(); setShowModal(true); }}>Add Recurring Expense</Button>
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
            ) : templates.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">🔁</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Recurring Expenses Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">Add a salary, rent, or subscription to get started.</p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={templates} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}

            <Modal
                isOpen={showModal}
                onClose={() => { setShowModal(false); resetForm(); }}
                title={editingTemplate ? 'Edit Recurring Expense' : 'Add Recurring Expense'}
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. Ali Khan — Sales Staff Salary"
                        required
                    />
                    <Select
                        label="Category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        options={categories.map((c) => ({ value: c.id, label: c.name }))}
                        placeholder="Select a category"
                        required
                    />
                    <Input
                        label="Monthly Amount (PKR)"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        required
                    />
                    <Input
                        label="Start Date"
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        required
                        disabled={!!editingTemplate}
                    />
                    <Input
                        label="Note"
                        value={formData.note}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        placeholder="Optional"
                    />

                    {formError && (
                        <div className="p-3 bg-error-50 border border-error-200 rounded-lg">
                            <p className="text-sm text-error-600">{formError}</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={formLoading}>
                            {editingTemplate ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete Recurring Expense"
                message={`Are you sure you want to delete "${deleteConfirm?.name}"? Past assignments and payments are unaffected — it just can't be assigned for future months anymore.`}
            />
        </div>
    );
};

export default RecurringExpenseTemplatesPage;
