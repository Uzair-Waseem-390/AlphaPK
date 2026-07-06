import { useState, useEffect } from 'react';
import { useCRUD } from '../../hooks/usePurchases';
import { purchasesApi } from '../../services/purchasesApi';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import SearchBar from '../../components/ui/SearchBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';

const ProductsPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data, loading, create, update, delete: deleteProduct, refetch } = useCRUD(
        purchasesApi.products,
        { search: '', category: '', shelf: '' }
    );

    const [categories, setCategories] = useState([]);
    const [shelves, setShelves] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [shelfFilter, setShelfFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        category: '',
        shelf: '',
    });
    const [formLoading, setFormLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        loadLookups();
    }, []);

    const loadLookups = async () => {
        try {
            const [cats, shelves] = await Promise.all([
                purchasesApi.categories.getAll(),
                purchasesApi.shelves.getAll(),
            ]);
            setCategories(cats.filter(c => !c.is_deleted));
            setShelves(shelves.filter(s => !s.is_deleted));
        } catch (error) {
            console.error('Failed to load lookups:', error);
        }
    };

    const filteredData = data.filter(item => {
        let matches = true;
        if (searchTerm) {
            matches = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.code.toLowerCase().includes(searchTerm.toLowerCase());
        }
        if (categoryFilter) {
            matches = matches && item.category?.id === parseInt(categoryFilter);
        }
        if (shelfFilter) {
            matches = matches && item.shelf?.id === parseInt(shelfFilter);
        }
        return matches;
    });

    const columns = [
        { key: 'code', label: 'Code', width: '120px' },
        { key: 'name', label: 'Name' },
        {
            key: 'category',
            label: 'Category',
            render: (value) => value?.name || 'N/A'
        },
        {
            key: 'shelf',
            label: 'Shelf',
            render: (value) => value?.name || 'N/A'
        },
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
            const submitData = {
                ...formData,
                category: parseInt(formData.category),
                shelf: parseInt(formData.shelf),
            };
            if (editingProduct) {
                await update(editingProduct.id, submitData);
            } else {
                await create(submitData);
            }
            setShowModal(false);
            resetForm();
        } catch (error) {
            console.error('Failed to save product:', error);
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (id) => {
        await deleteProduct(id);
        setDeleteConfirm(null);
    };

    const handleEdit = (product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            code: product.code,
            category: product.category?.id || '',
            shelf: product.shelf?.id || '',
        });
        setShowModal(true);
    };

    const resetForm = () => {
        setFormData({ name: '', code: '', category: '', shelf: '' });
        setEditingProduct(null);
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
                    <h1 className="text-3xl font-bold text-neutral-900">Products</h1>
                    <p className="text-neutral-500 mt-1">Manage products and inventory</p>
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
                        Add Product
                    </Button>
                )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
                <SearchBar
                    onSearch={setSearchTerm}
                    placeholder="Search products..."
                    className="flex-1"
                />
                <Select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    options={[
                        { value: '', label: 'All Categories' },
                        ...categories.map(c => ({ value: c.id, label: c.name })),
                    ]}
                    className="w-48"
                />
                <Select
                    value={shelfFilter}
                    onChange={(e) => setShelfFilter(e.target.value)}
                    options={[
                        { value: '', label: 'All Shelves' },
                        ...shelves.map(s => ({ value: s.id, label: s.name })),
                    ]}
                    className="w-48"
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
                title={editingProduct ? 'Edit Product' : 'Create Product'}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter product name"
                        required
                    />
                    <Input
                        label="Code"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        placeholder="Enter unique code"
                        required
                    />
                    <Select
                        label="Category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        options={categories.map(c => ({ value: c.id, label: c.name }))}
                        placeholder="Select category"
                        required
                    />
                    <Select
                        label="Shelf"
                        value={formData.shelf}
                        onChange={(e) => setFormData({ ...formData, shelf: e.target.value })}
                        options={shelves.map(s => ({ value: s.id, label: s.name }))}
                        placeholder="Select shelf"
                        required
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
                            {editingProduct ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete Product"
                message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
            />
        </div>
    );
};

export default ProductsPage;