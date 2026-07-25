import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRecurringExpenseCategories } from '../../hooks/useRecurringExpenses';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const RecurringExpenseCategoriesPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const {
        data: categories, meta, page, setPage, loading,
        refetch, create, update, delete: deleteCategory,
    } = useRecurringExpenseCategories();

    const [showModal, setShowModal] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const resetForm = () => {
        setFormData({ name: '', description: '' });
        setEditingCategory(null);
        setFormError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormLoading(true);
        try {
            if (editingCategory) {
                await update(editingCategory.id, formData);
            } else {
                await create(formData);
            }
            setShowModal(false);
            resetForm();
            refetch();
        } catch (error) {
            setFormError(error.response?.data?.detail || error.response?.data?.name?.[0] || 'Failed to save category');
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = (category) => {
        setEditingCategory(category);
        setFormData({ name: category.name, description: category.description || '' });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        try {
            await deleteCategory(id);
            setDeleteConfirm(null);
            refetch();
        } catch (error) {
            setDeleteConfirm(null);
            alert(error.response?.data?.detail || 'Failed to delete category');
        }
    };

    const columns = [
        { key: 'name', label: 'Name' },
        { key: 'description', label: 'Description', render: (v) => v || <span className="text-neutral-300">—</span> },
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
                <p className="text-neutral-500 mt-2">Only admins or superusers can view recurring expense categories.</p>
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
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Categories</h1>
                    <p className="text-neutral-500 mt-1">
                        Deleting a category only hides it from new templates — anything already assigned keeps its own frozen category name forever.
                    </p>
                </div>
                <Button onClick={() => { resetForm(); setShowModal(true); }}>Add Category</Button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : categories.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">🏷️</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Categories Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">Add one to start registering recurring expenses (Rent, Salaries, ...).</p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={categories} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}

            <Modal
                isOpen={showModal}
                onClose={() => { setShowModal(false); resetForm(); }}
                title={editingCategory ? 'Edit Category' : 'Add Category'}
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. Rent, Salaries, Utilities"
                        required
                    />
                    <Input
                        label="Description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
                            {editingCategory ? 'Update Category' : 'Create Category'}
                        </Button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete Category"
                message={`Are you sure you want to delete "${deleteConfirm?.name}"? Templates and history using it are unaffected — it just won't be selectable going forward.`}
            />
        </div>
    );
};

export default RecurringExpenseCategoriesPage;
