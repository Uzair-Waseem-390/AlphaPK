import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import { useParams, Link, useNavigate } from 'react-router-dom';

const ReturnsPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
    const { orderId } = useParams();
    const navigate = useNavigate();

    const [returns, setReturns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [formData, setFormData] = useState({
        items: [],
        note: '',
    });
    const [orderItems, setOrderItems] = useState([]);
    const [formLoading, setFormLoading] = useState(false);
    const [filters, setFilters] = useState({});

    useEffect(() => {
        if (orderId && orderId !== 'undefined') {
            fetchReturns();
            fetchOrderItems();
        }
    }, [orderId, filters]);

    const fetchReturns = async () => {
        if (!orderId || orderId === 'undefined') return;
        setLoading(true);
        try {
            const data = await purchasesApi.returns.getByOrder(orderId);
            console.log('Order returns data:', data); // Debug log
            setReturns(data || []);
        } catch (error) {
            console.error('Failed to fetch returns:', error);
            setReturns([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchOrderItems = async () => {
        try {
            const order = await purchasesApi.orders.getById(orderId);
            setOrderItems(order.items || []);
        } catch (error) {
            console.error('Failed to fetch order items:', error);
        }
    };

    const handleCreateReturn = async (e) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            await purchasesApi.returns.create(orderId, {
                items: formData.items.map(item => ({
                    invoice_item_id: item.invoice_item_id,
                    quantity: item.quantity,
                })),
                note: formData.note,
            });
            setShowCreateModal(false);
            resetForm();
            fetchReturns();
        } catch (error) {
            console.error('Failed to create return:', error);
        } finally {
            setFormLoading(false);
        }
    };

    const handleAcceptReturn = async (returnId) => {
        if (!window.confirm('Are you sure you want to accept this return?')) return;

        try {
            await purchasesApi.returns.accept(returnId);
            fetchReturns();
        } catch (error) {
            console.error('Failed to accept return:', error);
        }
    };

    const resetForm = () => {
        setFormData({
            items: [],
            note: '',
        });
    };

    const handleAddReturnItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [
                ...prev.items,
                { invoice_item_id: '', quantity: 1 }
            ]
        }));
    };

    const handleUpdateReturnItem = (index, field, value) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            )
        }));
    };

    const handleRemoveReturnItem = (index) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    };

    const getStatusBadge = (status) => {
        const variants = {
            pending: 'pending',
            accepted: 'accepted',
        };
        return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
    };

    const columns = [
        { key: 'reference_number', label: 'Return #', width: '140px' },
        {
            key: 'order_number',
            label: 'Order #',
            render: (value) => value || 'N/A'
        },
        {
            key: 'supplier_name',
            label: 'Supplier',
            render: (value) => value || 'N/A'
        },
        {
            key: 'status',
            label: 'Status',
            render: getStatusBadge
        },
        {
            key: 'total_return_amount',
            label: 'Amount (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
        },
        {
            key: 'created_at',
            label: 'Date',
            render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A'
        },
        { key: 'note', label: 'Note', render: (value) => value || '-' },
        {
            key: 'actions',
            label: 'Actions',
            width: '120px',
            render: (_, row) => row.status === 'pending' && isAdmin && (
                <Button
                    size="sm"
                    variant="success"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleAcceptReturn(row.id);
                    }}
                >
                    Accept
                </Button>
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

    if (!orderId || orderId === 'undefined') {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Invalid Order</h2>
                <p className="text-neutral-500 mt-2">Please go back to the orders list.</p>
                <Link to="/purchases/orders" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Orders
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">Order Returns</h1>
                    <p className="text-neutral-500 mt-1">
                        Manage returns for Order #{orderId}
                    </p>
                    <div className="mt-2">
                        <Link to="/purchases/returns" className="text-sm text-primary-600 hover:text-primary-700">
                            View All Returns →
                        </Link>
                    </div>
                </div>
                {isAdmin && (
                    <Button
                        onClick={() => {
                            resetForm();
                            setShowCreateModal(true);
                        }}
                        icon={({ className }) => (
                            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        )}
                    >
                        Create Return
                    </Button>
                )}
            </div>

            <Table
                columns={columns}
                data={returns}
                onRowClick={(ret) => navigate(`/purchases/returns/${ret.id}`)}
            />

            {/* Create Return Modal */}
            <Modal
                isOpen={showCreateModal}
                onClose={() => {
                    setShowCreateModal(false);
                    resetForm();
                }}
                title="Create Return"
                size="lg"
            >
                <form onSubmit={handleCreateReturn} className="space-y-6 max-h-[70vh] overflow-y-auto">
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-neutral-900">Items to Return</h3>
                            <Button size="sm" onClick={handleAddReturnItem}>
                                Add Item
                            </Button>
                        </div>

                        <div className="space-y-2">
                            {formData.items.length === 0 ? (
                                <p className="text-center text-neutral-500 py-4">No items added yet</p>
                            ) : (
                                formData.items.map((item, index) => (
                                    <div key={index} className="grid grid-cols-3 gap-2 p-3 bg-neutral-50 rounded-lg">
                                        <Select
                                            label="Product"
                                            value={item.invoice_item_id}
                                            onChange={(e) => handleUpdateReturnItem(index, 'invoice_item_id', parseInt(e.target.value))}
                                            options={orderItems.map(i => ({
                                                value: i.id,
                                                label: `${i.product_name} (Returnable: ${i.returnable_quantity})`,
                                            }))}
                                            placeholder="Select item"
                                            required
                                        />
                                        <Input
                                            label="Quantity"
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) => handleUpdateReturnItem(index, 'quantity', parseInt(e.target.value) || 0)}
                                            required
                                        />
                                        <div className="flex items-end">
                                            <Button
                                                size="sm"
                                                variant="danger"
                                                onClick={() => handleRemoveReturnItem(index)}
                                                className="w-full"
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <Input
                        label="Note"
                        value={formData.note}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        placeholder="Return note (optional)"
                    />

                    <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                setShowCreateModal(false);
                                resetForm();
                            }}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={formLoading}>
                            Create Return
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ReturnsPage;