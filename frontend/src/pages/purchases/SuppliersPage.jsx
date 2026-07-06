import { useState } from 'react';
import { motion } from 'framer-motion';
import { useCRUD } from '../../hooks/usePurchases';
import { purchasesApi } from '../../services/purchasesApi';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import SearchBar from '../../components/ui/SearchBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';

const SuppliersPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data, loading, create, update, delete: deleteSupplier, refetch } = useCRUD(
        purchasesApi.suppliers,
        { search: '' }
    );

    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [outstandingOrders, setOutstandingOrders] = useState([]);
    const [payableSummary, setPayableSummary] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        address: '',
        mobile: '',
    });
    const [formLoading, setFormLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [showOrderDetail, setShowOrderDetail] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);

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

    const handleViewDetails = async (supplier) => {
        if (!supplier || supplier.is_deleted) return;

        setSelectedSupplier(supplier);
        setShowDetailModal(true);
        setDetailLoading(true);
        try {
            const [orders, summary] = await Promise.all([
                purchasesApi.suppliers.getOutstandingOrders(supplier.id),
                purchasesApi.suppliers.getPayableSummary(supplier.id),
            ]);
            setOutstandingOrders(orders || []);
            setPayableSummary(summary || {});
        } catch (error) {
            console.error('Failed to load supplier details:', error);
            setOutstandingOrders([]);
            setPayableSummary({});
        } finally {
            setDetailLoading(false);
        }
    };

    const handleViewOrderDetail = (order) => {
        setSelectedOrder(order);
        setShowOrderDetail(true);
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

    const getStatusBadge = (status) => {
        const variants = {
            draft: 'draft',
            confirmed: 'confirmed',
        };
        return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
    };

    const getPaymentStatusBadge = (status) => {
        const variants = {
            unpaid: 'unpaid',
            partial: 'partial',
            paid: 'paid',
        };
        return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
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

            {/* Supplier Detail Modal */}
            <Modal
                isOpen={showDetailModal}
                onClose={() => {
                    setShowDetailModal(false);
                    setSelectedSupplier(null);
                    setOutstandingOrders([]);
                    setPayableSummary(null);
                    setShowOrderDetail(false);
                    setSelectedOrder(null);
                }}
                title="Supplier Details"
                size="lg"
            >
                {detailLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <LoadingSpinner />
                    </div>
                ) : (
                    <>
                        {selectedSupplier && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-neutral-500">Name</p>
                                        <p className="font-medium">{selectedSupplier.name}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-neutral-500">Code</p>
                                        <p className="font-medium">{selectedSupplier.code}</p>
                                    </div>
                                </div>

                                {payableSummary && Object.keys(payableSummary).length > 0 && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <Card className="p-4">
                                            <p className="text-sm text-neutral-500">Total Net Payable</p>
                                            <p className="text-xl font-bold text-neutral-900">
                                                ${typeof payableSummary.total_net_payable === 'string'
                                                    ? parseFloat(payableSummary.total_net_payable).toFixed(2)
                                                    : '0.00'}
                                            </p>
                                        </Card>
                                        <Card className="p-4">
                                            <p className="text-sm text-neutral-500">Total Paid</p>
                                            <p className="text-xl font-bold text-success-600">
                                                ${typeof payableSummary.total_paid === 'string'
                                                    ? parseFloat(payableSummary.total_paid).toFixed(2)
                                                    : '0.00'}
                                            </p>
                                        </Card>
                                        <Card className="p-4">
                                            <p className="text-sm text-neutral-500">Outstanding</p>
                                            <p className="text-xl font-bold text-error-600">
                                                ${typeof payableSummary.total_payable_outstanding === 'string'
                                                    ? parseFloat(payableSummary.total_payable_outstanding).toFixed(2)
                                                    : '0.00'}
                                            </p>
                                        </Card>
                                        <Card className="p-4">
                                            <p className="text-sm text-neutral-500">Payment Status</p>
                                            <Badge
                                                variant={parseFloat(payableSummary.total_payable_outstanding || 0) > 0 ? 'unpaid' : 'paid'}
                                            >
                                                {parseFloat(payableSummary.total_payable_outstanding || 0) > 0 ? 'Outstanding' : 'Settled'}
                                            </Badge>
                                        </Card>
                                    </div>
                                )}

                                {outstandingOrders.length > 0 && (
                                    <div>
                                        <h3 className="font-semibold text-neutral-900 mb-3">Outstanding Orders</h3>
                                        <div className="space-y-2">
                                            {outstandingOrders.map((order) => (
                                                <Card
                                                    key={order.id}
                                                    className="p-4 cursor-pointer hover:shadow-card-hover transition-shadow"
                                                    onClick={() => handleViewOrderDetail(order)}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <p className="font-medium">{order.order_number}</p>
                                                            <p className="text-sm text-neutral-500">
                                                                {order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A'}
                                                            </p>
                                                            <div className="flex gap-2 mt-1">
                                                                {getStatusBadge(order.status)}
                                                                {getPaymentStatusBadge(order.payment_status)}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="font-semibold text-error-600">
                                                                ${typeof order.payable_outstanding === 'string'
                                                                    ? parseFloat(order.payable_outstanding).toFixed(2)
                                                                    : '0.00'}
                                                            </p>
                                                            <p className="text-sm text-neutral-500">
                                                                Total: ${typeof order.net_payable === 'string'
                                                                    ? parseFloat(order.net_payable).toFixed(2)
                                                                    : '0.00'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {outstandingOrders.length === 0 && (
                                    <p className="text-center text-neutral-500 py-4">No outstanding orders</p>
                                )}
                            </div>
                        )}
                    </>
                )}
            </Modal>

            {/* Order Detail Modal */}
            <Modal
                isOpen={showOrderDetail}
                onClose={() => {
                    setShowOrderDetail(false);
                    setSelectedOrder(null);
                }}
                title="Order Details"
                size="lg"
            >
                {selectedOrder && (
                    <div className="space-y-6 max-h-[70vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-neutral-500">Order Number</p>
                                <p className="font-medium">{selectedOrder.order_number}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Status</p>
                                {getStatusBadge(selectedOrder.status)}
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Supplier</p>
                                <p className="font-medium">{selectedOrder.supplier?.name}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Payment Type</p>
                                <p className="font-medium">{selectedOrder.payment_type}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Net Payable</p>
                                <p className="font-medium text-primary-600">
                                    ${typeof selectedOrder.net_payable === 'string'
                                        ? parseFloat(selectedOrder.net_payable).toFixed(2)
                                        : '0.00'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Payment Status</p>
                                {getPaymentStatusBadge(selectedOrder.payment_status)}
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Total Paid</p>
                                <p className="font-medium">
                                    ${typeof selectedOrder.total_paid === 'string'
                                        ? parseFloat(selectedOrder.total_paid).toFixed(2)
                                        : '0.00'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Payable Outstanding</p>
                                <p className="font-medium text-error-600">
                                    ${typeof selectedOrder.payable_outstanding === 'string'
                                        ? parseFloat(selectedOrder.payable_outstanding).toFixed(2)
                                        : '0.00'}
                                </p>
                            </div>
                            {selectedOrder.confirmed_at && (
                                <div>
                                    <p className="text-sm text-neutral-500">Confirmed</p>
                                    <p className="font-medium">{new Date(selectedOrder.confirmed_at).toLocaleString()}</p>
                                </div>
                            )}
                            {selectedOrder.description && (
                                <div className="col-span-2">
                                    <p className="text-sm text-neutral-500">Description</p>
                                    <p className="font-medium">{selectedOrder.description}</p>
                                </div>
                            )}
                        </div>

                        {selectedOrder.items && selectedOrder.items.length > 0 && (
                            <div>
                                <h3 className="font-semibold text-neutral-900 mb-3">Items</h3>
                                <div className="space-y-2">
                                    {selectedOrder.items.map((item, index) => (
                                        <div key={index} className="flex justify-between items-center p-2 bg-neutral-50 rounded-lg">
                                            <div>
                                                <p className="font-medium">{item.product_name}</p>
                                                <p className="text-sm text-neutral-500">
                                                    {item.quantity} × ${typeof item.unit_price === 'string'
                                                        ? parseFloat(item.unit_price).toFixed(2)
                                                        : '0.00'}
                                                </p>
                                                <p className="text-xs text-neutral-400">
                                                    Remaining: {item.remaining_quantity} | Returned: {item.returned_quantity}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-medium">${typeof item.total_price === 'string'
                                                    ? parseFloat(item.total_price).toFixed(2)
                                                    : '0.00'}</p>
                                                <p className="text-xs text-neutral-500">
                                                    GST: ${typeof item.gst_amount === 'string'
                                                        ? parseFloat(item.gst_amount).toFixed(2)
                                                        : '0.00'} |
                                                    WHT: ${typeof item.wht_amount === 'string'
                                                        ? parseFloat(item.wht_amount).toFixed(2)
                                                        : '0.00'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete Supplier"
                message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
            />
        </div>
    );
};

export default SuppliersPage;