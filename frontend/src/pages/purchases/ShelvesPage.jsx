import { useState } from 'react';
import { useCRUD } from '../../hooks/usePurchases';
import { purchasesApi } from '../../services/purchasesApi';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import SearchBar from '../../components/ui/SearchBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';

const ShelvesPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data, loading, create, update, delete: deleteShelf } = useCRUD(
        purchasesApi.shelves
    );

    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingShelf, setEditingShelf] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [formLoading, setFormLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const filteredData = data.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const columns = [
        { key: 'id', label: 'ID', width: '80px' },
        { key: 'name', label: 'Name' },
        { key: 'description', label: 'Description' },
        {
            key: 'is_deleted',
            label: 'Status',
            render: (value) => (
                <Badge variant={value ? 'error' : 'success'}>
                    {value ? 'Deleted' : 'Active'}
                </Badge>
            ),
        },
        {
            key: 'actions',
            label: 'Actions',
            width: '120px',
            render: (_, row) => isAdmin && !row.is_deleted && (
                <div className="flex gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(row);
                        }}
                        className="text-primary-600 hover:text-primary-700"
                    >
                        Edit
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(row);
                        }}
                        className="text-error-600 hover:text-error-700"
                    >
                        Delete
                    </button>
                </div>
            ),
        },
    ];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            if (editingShelf) {
                await update(editingShelf.id, formData);
            } else {
                await create(formData);
            }
            setShowModal(false);
            resetForm();
        } catch (error) {
            console.error('Failed to save shelf:', error);
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (id) => {
        await deleteShelf(id);
        setDeleteConfirm(null);
    };

    const handleEdit = (shelf) => {
        setEditingShelf(shelf);
        setFormData({ name: shelf.name, description: shelf.description || '' });
        setShowModal(true);
    };

    const resetForm = () => {
        setFormData({ name: '', description: '' });
        setEditingShelf(null);
    };

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
                    <h1 className="text-3xl font-bold text-neutral-900">Shelves</h1>
                    <p className="text-neutral-500 mt-1">Manage product shelves</p>
                </div>
                {isAdmin && (
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
                        Add Shelf
                    </Button>
                )}
            </div>

            <div className="flex gap-4">
                <SearchBar
                    onSearch={setSearchTerm}
                    placeholder="Search shelves..."
                    className="flex-1"
                />
            </div>

            <Table
                columns={columns}
                data={filteredData}
            />

            <Modal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    resetForm();
                }}
                title={editingShelf ? 'Edit Shelf' : 'Create Shelf'}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter shelf name"
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
                            {editingShelf ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete Shelf"
                message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
            />
        </div>
    );
};

export default ShelvesPage;