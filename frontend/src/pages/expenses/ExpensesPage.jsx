import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom'; // Add this import
import { useExpenses, useExpenseCategories, useCashFlowStats } from '../../hooks/useCashFlow';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import SearchBar from '../../components/ui/SearchBar';
import FilterBar from '../../components/ui/FilterBar';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';

const ExpensesPage = () => {
    const navigate = useNavigate(); // Add this
    const { data: expenses, loading, filters, setFilters, refetch, create, update, delete: deleteExpense } = useExpenses();
    const { data: categories, loading: categoriesLoading } = useExpenseCategories();
    const { refetch: refetchStats } = useCashFlowStats();

    const [showModal, setShowModal] = useState(false);
    const [editingExpense, setEditingExpense] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        category: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        description: '',
    });
    const [formLoading, setFormLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [filterValues, setFilterValues] = useState({});

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            const data = {
                ...formData,
                amount: parseFloat(formData.amount),
                category: parseInt(formData.category),
            };

            if (editingExpense) {
                await update(editingExpense.id, data);
            } else {
                await create(data);
            }
            setShowModal(false);
            resetForm();
            refetch();
            refetchStats();
        } catch (error) {
            console.error('Failed to save expense:', error);
            alert(error.response?.data?.detail || 'Failed to save expense');
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = (expense) => {
        setEditingExpense(expense);
        setFormData({
            name: expense.name || '',
            category: expense.category?.id || '',
            amount: expense.amount || '',
            expense_date: expense.expense_date || new Date().toISOString().split('T')[0],
            description: expense.description || '',
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        await deleteExpense(id);
        setDeleteConfirm(null);
        refetch();
        refetchStats();
    };

    const resetForm = () => {
        setFormData({
            name: '',
            category: '',
            amount: '',
            expense_date: new Date().toISOString().split('T')[0],
            description: '',
        });
        setEditingExpense(null);
    };

    const handleApplyFilters = (newFilters) => {
        setFilterValues(newFilters);
        setFilters(newFilters);
    };

    const handleResetFilters = () => {
        setFilterValues({});
        setSearchTerm('');
        setFilters({});
    };

    const handleSearch = (value) => {
        setSearchTerm(value);
        setFilters({ ...filters, search: value });
    };

    const handleRowClick = (expense) => {
        navigate(`/expenses/${expense.id}`);
    };

    const columns = [
        { key: 'name', label: 'Name' },
        {
            key: 'category',
            label: 'Category',
            render: (value) => value?.name || 'N/A'
        },
        {
            key: 'amount',
            label: 'Amount (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
        },
        {
            key: 'expense_date',
            label: 'Date',
            render: (value) => new Date(value).toLocaleDateString()
        },
        { key: 'description', label: 'Description', render: (value) => value || '-' },
        {
            key: 'actions',
            label: 'Actions',
            width: '120px',
            render: (_, row) => (
                <div className="flex gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(row); }}
                        className="text-primary-600 hover:text-primary-700 text-sm"
                    >
                        Edit
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(row); }}
                        className="text-error-600 hover:text-error-700 text-sm"
                    >
                        Delete
                    </button>
                </div>
            ),
        },
    ];

    const filterConfig = [
        {
            name: 'category',
            label: 'Category',
            type: 'select',
            options: [
                { value: '', label: 'All Categories' },
                ...categories.map(c => ({ value: c.id, label: c.name })),
            ],
        },
        { name: 'date_from', label: 'Date From', type: 'date' },
        { name: 'date_to', label: 'Date To', type: 'date' },
        { name: 'min_amount', label: 'Min Amount', type: 'number' },
        { name: 'max_amount', label: 'Max Amount', type: 'number' },
    ];

    if (loading || categoriesLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">Expenses</h1>
                    <p className="text-neutral-500 mt-1">Manage all business expenses</p>
                </div>
                <Button
                    onClick={() => {
                        resetForm();
                        setShowModal(true);
                    }}
                    icon={({ className }) => (
                        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    )}
                >
                    Add Expense
                </Button>
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <SearchBar
                        onSearch={handleSearch}
                        placeholder="Search by name or description..."
                        className="flex-1"
                        value={searchTerm}
                    />
                    <Button
                        variant="secondary"
                        onClick={() => setShowFilters(!showFilters)}
                        icon={({ className }) => (
                            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                        )}
                    >
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </Button>
                    {(Object.keys(filterValues).length > 0 || searchTerm) && (
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

            <Table
                columns={columns}
                data={expenses}
                onRowClick={handleRowClick}
            />

            {/* Create/Edit Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    resetForm();
                }}
                title={editingExpense ? 'Edit Expense' : 'Add Expense'}
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Expense Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter expense name"
                        required
                    />

                    <Select
                        label="Category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        options={[
                            { value: '', label: 'Select category' },
                            ...categories.map(c => ({ value: c.id, label: c.name })),
                        ]}
                        required
                    />

                    <Input
                        label="Amount (PKR)"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        placeholder="Enter amount"
                        required
                    />

                    <Input
                        label="Expense Date"
                        type="date"
                        value={formData.expense_date}
                        onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                        required
                    />

                    <Input
                        label="Description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Enter description (optional)"
                    />

                    {!editingExpense && formData.amount && parseFloat(formData.amount) > 0 && (
                        <div className="p-3 bg-amber-50 rounded-lg">
                            <p className="text-sm text-amber-700">
                                ⚠️ This expense will deduct <strong>Rs. {parseFloat(formData.amount).toFixed(2)}</strong> from cash in hand
                            </p>
                        </div>
                    )}

                    {editingExpense && formData.amount && parseFloat(formData.amount) > 0 && (
                        <div className="p-3 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-700">
                                ℹ️ Updating amount will adjust cash in hand by the difference
                            </p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                setShowModal(false);
                                resetForm();
                            }}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={formLoading}>
                            {editingExpense ? 'Update Expense' : 'Create Expense'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete Expense"
                message={`Are you sure you want to delete "${deleteConfirm?.name}"? This will restore the amount to cash in hand.`}
            />
        </div>
    );
};

export default ExpensesPage;