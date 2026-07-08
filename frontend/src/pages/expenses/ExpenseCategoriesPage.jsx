import { useState } from 'react';
import { motion } from 'framer-motion';
import { useExpenseCategories } from '../../hooks/useCashFlow';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';

const ExpenseCategoriesPage = () => {
    const { data: categories, loading, create, update, delete: deleteCategory, refetch } = useExpenseCategories();

    const [showModal, setShowModal] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [formLoading, setFormLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
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
            console.error('Failed to save category:', error);
            alert(error.response?.data?.detail || 'Failed to save category');
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
        await deleteCategory(id);
        setDeleteConfirm(null);
        refetch();
    };

    const resetForm = () => {
        setFormData({ name: '', description: '' });
        setEditingCategory(null);
    };

    const columns = [
        { key: 'name', label: 'Name' },
        { key: 'description', label: 'Description', render: (value) => value || '-' },
        {
            key: 'created_by',
            label: 'Created By',
            render: (value) => value || 'N/A'
        },
        {
            key: 'created_at',
            label: 'Created',
            render: (value) => new Date(value).toLocaleDateString()
        },
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

    if (loading) {
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
                    <h1 className="text-3xl font-bold text-neutral-900">Expense Categories</h1>
                    <p className="text-neutral-500 mt-1">Manage expense categories for your business</p>
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
                    Add Category
                </Button>
            </div>

            <Table columns={columns} data={categories} />

            {/* Create/Edit Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    resetForm();
                }}
                title={editingCategory ? 'Edit Category' : 'Add Category'}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter category name"
                        required
                    />
                    <Input
                        label="Description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Enter description (optional)"
                    />
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
                            {editingCategory ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete Category"
                message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
            />
        </div>
    );
};

export default ExpenseCategoriesPage;