import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import Pagination from '../../components/ui/Pagination';
import { useAuth } from '../../context/AuthContext';

const ShelvesPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data, meta, page, setPage, loading, filters, setFilters, create, update, delete: deleteShelf } = useCRUD(
        purchasesApi.shelves,
        { product_search: '' }
    );

    const [searchTerm, setSearchTerm] = useState('');
    const [productSearchTerm, setProductSearchTerm] = useState('');
    // Bumped on "Clear Filters" to force both SearchBars (uncontrolled,
    // internal-state inputs) to remount with an empty value — SearchBar
    // has no external value/reset prop, so a key change is the only way
    // to visually clear it without changing the shared component.
    const [filterResetKey, setFilterResetKey] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [editingShelf, setEditingShelf] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [formLoading, setFormLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const filteredData = data.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handleProductSearch = (value) => {
        setProductSearchTerm(value);
        setFilters({ ...filters, product_search: value });
    };

    const hasActiveFilters = !!searchTerm || !!productSearchTerm;

    const handleClearFilters = () => {
        setSearchTerm('');
        setProductSearchTerm('');
        setFilters({ ...filters, product_search: '' });
        setFilterResetKey((k) => k + 1);
    };

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
                    key={`name-${filterResetKey}`}
                    onSearch={setSearchTerm}
                    placeholder="Search shelves..."
                    className="flex-1"
                />
                <SearchBar
                    key={`product-${filterResetKey}`}
                    onSearch={handleProductSearch}
                    placeholder="Search by product name or code..."
                    className="flex-1"
                />
                {hasActiveFilters && (
                    <Button type="button" variant="secondary" onClick={handleClearFilters}>
                        Clear Filters
                    </Button>
                )}
            </div>

            <Table
                columns={columns}
                data={filteredData}
                onRowClick={(row) => navigate(`/purchases/shelves/${row.id}`)}
            />

            {meta.totalPages > 1 && (
                <Pagination
                    currentPage={meta.currentPage}
                    totalPages={meta.totalPages}
                    onPageChange={setPage}
                />
            )}

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