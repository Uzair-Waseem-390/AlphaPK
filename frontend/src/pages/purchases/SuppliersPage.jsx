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
import { useAuth } from '../../context/AuthContext';

const SuppliersPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
    const navigate = useNavigate();

    const { data, loading, create, update, delete: deleteSupplier, refetch } = useCRUD(
        purchasesApi.suppliers,
        { search: '' }
    );

    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        address: '',
        mobile: '',
    });
    const [formLoading, setFormLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const filteredData = data.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const columns = [
        { key: 'code', label: 'Code', width: '120px' },
        { key: 'name', label: 'Name' },
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
            width: '180px', // Increased width to accommodate new button
            render: (_, row) => isAdmin && !row.is_deleted && (
                <div className="flex gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(row);
                        }}
                        className="text-primary-600 hover:text-primary-700 text-sm"
                    >
                        Edit
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/ledger/supplier/${row.id}`);
                        }}
                        className="text-indigo-600 hover:text-indigo-700 text-sm"
                    >
                        Ledger
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(row);
                        }}
                        className="text-error-600 hover:text-error-700 text-sm"
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
                code: formData.code.toUpperCase(),
            };
            if (editingSupplier) {
                await update(editingSupplier.id, submitData);
            } else {
                await create(submitData);
            }
            setShowModal(false);
            resetForm();
        } catch (error) {
            console.error('Failed to save supplier:', error);
        } finally {
            setFormLoading(false);
        }
    };

    const handleViewDetails = (supplier) => {
        if (!supplier || supplier.is_deleted) return;
        navigate(`/purchases/suppliers/${supplier.id}`);
    };

    const handleDelete = async (id) => {
        await deleteSupplier(id);
        setDeleteConfirm(null);
    };

    const handleEdit = (supplier) => {
        setEditingSupplier(supplier);
        setFormData({
            name: supplier.name,
            code: supplier.code,
            address: supplier.address || '',
            mobile: supplier.mobile || '',
        });
        setShowModal(true);
    };

    const resetForm = () => {
        setFormData({ name: '', code: '', address: '', mobile: '' });
        setEditingSupplier(null);
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
                    <h1 className="text-3xl font-bold text-neutral-900">Suppliers</h1>
                    <p className="text-neutral-500 mt-1">Manage suppliers and view outstanding</p>
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
                        Add Supplier
                    </Button>
                )}
            </div>

            <div className="flex gap-4">
                <SearchBar
                    onSearch={setSearchTerm}
                    placeholder="Search suppliers by name or code..."
                    className="flex-1"
                />
            </div>

            <Table
                columns={columns}
                data={filteredData}
                onRowClick={handleViewDetails}
            />

            {/* Create/Edit Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    resetForm();
                }}
                title={editingSupplier ? 'Edit Supplier' : 'Create Supplier'}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter supplier name"
                        required
                    />
                    <Input
                        label="Code"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        placeholder="Enter unique code (auto-uppercased)"
                        required
                    />
                    <Input
                        label="Address"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="Enter address"
                        required
                    />
                    <Input
                        label="Mobile"
                        value={formData.mobile}
                        onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                        placeholder="Enter mobile number (optional)"
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
                            {editingSupplier ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default SuppliersPage;