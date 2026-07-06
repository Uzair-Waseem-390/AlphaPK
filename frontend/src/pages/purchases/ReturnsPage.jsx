import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import SearchBar from '../../components/ui/SearchBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import { useParams } from 'react-router-dom';

const ReturnsPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
    const { orderId } = useParams();

    const [returns, setReturns] = useState([]);
    const [allReturns, setAllReturns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedReturn, setSelectedReturn] = useState(null);
    const [formData, setFormData] = useState({
        items: [],
        note: '',
    });
    const [orderItems, setOrderItems] = useState([]);
    const [formLoading, setFormLoading] = useState(false);
    const [filters, setFilters] = useState({});
    const [isGlobalView, setIsGlobalView] = useState(false);

    useEffect(() => {
        if (orderId && !isGlobalView) {
            fetchReturns();
            fetchOrderItems();
        } else {
            fetchAllReturns();
        }
    }, [orderId, filters, isGlobalView]);

    const fetchReturns = async () => {
        setLoading(true);
        try {
            const data = await purchasesApi.returns.getByOrder(orderId);
            setReturns(data);
        } catch (error) {
            console.error('Failed to fetch returns:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAllReturns = async () => {
        setLoading(true);
        try {
            const data = await purchasesApi.returns.getAll(filters);
            setAllReturns(data);
        } catch (error) {
            console.error('Failed to fetch returns:', error);
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
            fetchAllReturns();
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
            key: 'status',
            label: 'Status',
            render: getStatusBadge
        },
        {
            key: 'total_return_amount',
            label: 'Amount',
            render: (value) => `$${parseFloat(value || 0).toFixed(2)}`
        },
        { key: 'created_at', label: 'Date', render: (value) => new Date(value).toLocaleDateString() },
        { key: 'note', label: 'Note' },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    const displayReturns = isGlobalView ? allReturns : returns;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">Returns</h1>
                    <p className="text-neutral-500 mt-1">Manage purchase returns</p>
                </div>
                {!isGlobalView && isAdmin && (
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

            {isGlobalView && (
                <div className="flex gap-4">
                    <SearchBar
                        onSearch={(value) => setFilters({ ...filters, search: value })}
                        placeholder="Search returns..."
                        className="flex-1"
                    />
                </div>
            )}

            <Table
                columns={columns}
                data={displayReturns}
                onRowClick={(ret) => {
                    setSelectedReturn(ret);
                    setShowDetailModal(true);
                }}
            />

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

            {/* Return Detail Modal */}
            <Modal
                isOpen={showDetailModal}
                onClose={() => {
                    setShowDetailModal(false);
                    setSelectedReturn(null);
                }}
                title="Return Details"
                size="lg"
            >
                {selectedReturn && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-neutral-500">Return Number</p>
                                <p className="font-medium">{selectedReturn.reference_number}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Status</p>
                                {getStatusBadge(selectedReturn.status)}
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Total Amount</p>
                                <p className="font-medium text-primary-600">
                                    ${parseFloat(selectedReturn.total_return_amount || 0).toFixed(2)}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Created</p>
                                <p className="font-medium">{new Date(selectedReturn.created_at).toLocaleString()}</p>
                            </div>
                            {selectedReturn.accepted_at && (
                                <div>
                                    <p className="text-sm text-neutral-500">Accepted</p>
                                    <p className="font-medium">{new Date(selectedReturn.accepted_at).toLocaleString()}</p>
                                </div>
                            )}
                        </div>

                        {selectedReturn.items && selectedReturn.items.length > 0 && (
                            <div>
                                <h3 className="font-semibold text-neutral-900 mb-3">Items</h3>
                                <div className="space-y-2">
                                    {selectedReturn.items.map((item, index) => (
                                        <div key={index} className="flex justify-between items-center p-2 bg-neutral-50 rounded-lg">
                                            <div>
                                                <p className="font-medium">{item.product_name}</p>
                                                <p className="text-sm text-neutral-500">Quantity: {item.quantity}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-medium">${parseFloat(item.line_total || 0).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedReturn.status === 'pending' && isAdmin && (
                            <div className="flex gap-3 pt-4 border-t border-neutral-200">
                                <Button
                                    variant="success"
                                    onClick={() => handleAcceptReturn(selectedReturn.id)}
                                >
                                    Accept Return
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ReturnsPage;