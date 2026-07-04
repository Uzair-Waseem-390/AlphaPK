import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { purchaseOrdersApi } from '../../utils/api';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const PurchaseOrderDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (id) {
            fetchOrder();
        }
    }, [id]);

    const fetchOrder = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await purchaseOrdersApi.getById(id);
            setOrder(data);
        } catch (error) {
            console.error('Failed to fetch order:', error);
            setError(error.response?.data?.detail || 'Failed to load order details');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-12">
                <div className="text-error-500 text-lg mb-4">⚠️ {error}</div>
                <Button variant="secondary" onClick={() => navigate('/purchases/orders')}>
                    Back to Orders
                </Button>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="text-center py-12">
                <p className="text-neutral-500">Order not found</p>
                <Button variant="secondary" className="mt-4" onClick={() => navigate('/purchases/orders')}>
                    Back to Orders
                </Button>
            </div>
        );
    }

    const statusColors = {
        draft: 'bg-yellow-100 text-yellow-700',
        confirmed: 'bg-green-100 text-green-700',
        partial: 'bg-blue-100 text-blue-700',
        returned: 'bg-red-100 text-red-700',
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">{order.bill_number || 'N/A'}</h1>
                    <div className="flex items-center gap-3 mt-1">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[order.status] || 'bg-gray-100 text-gray-700'}`}>
                            {order.status || 'Unknown'}
                        </span>
                        <span className="text-neutral-500">Created: {order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A'}</span>
                    </div>
                </div>
                <Button variant="secondary" onClick={() => navigate('/purchases/orders')}>
                    ← Back to Orders
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <h3 className="font-semibold text-neutral-900 mb-4">Order Information</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-neutral-500">Status</span>
                            <span className="font-medium capitalize">{order.status}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-neutral-500">Payment Status</span>
                            <span className="font-medium capitalize">{order.payment_status_display || order.payment_status || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-neutral-500">Created At</span>
                            <span className="font-medium">{order.created_at ? new Date(order.created_at).toLocaleString() : 'N/A'}</span>
                        </div>
                        {order.confirmed_at && (
                            <div className="flex justify-between items-center">
                                <span className="text-neutral-500">Confirmed At</span>
                                <span className="font-medium">{new Date(order.confirmed_at).toLocaleString()}</span>
                            </div>
                        )}
                        {order.confirmed_by && (
                            <div className="flex justify-between items-center">
                                <span className="text-neutral-500">Confirmed By</span>
                                <span className="font-medium">{order.confirmed_by}</span>
                            </div>
                        )}
                    </div>
                </Card>

                <Card>
                    <h3 className="font-semibold text-neutral-900 mb-4">Customer Information</h3>
                    {order.customer ? (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-neutral-500">Name</span>
                                <span className="font-medium">{order.customer.name || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-neutral-500">Code</span>
                                <span className="font-medium">{order.customer.code || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-neutral-500">Mobile</span>
                                <span className="font-medium">{order.customer.mobile || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-neutral-500">Address</span>
                                <span className="font-medium text-right">{order.customer.address || 'N/A'}</span>
                            </div>
                        </div>
                    ) : (
                        <p className="text-neutral-500">No customer information</p>
                    )}
                </Card>
            </div>

            {/* Financial Summary */}
            <Card>
                <h3 className="font-semibold text-neutral-900 mb-4">Financial Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-neutral-50 p-4 rounded-xl">
                        <p className="text-xs text-neutral-500">Subtotal</p>
                        <p className="text-lg font-semibold text-neutral-900">${parseFloat(order.subtotal || 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-neutral-50 p-4 rounded-xl">
                        <p className="text-xs text-neutral-500">GST Total</p>
                        <p className="text-lg font-semibold text-neutral-900">${parseFloat(order.gst_total || 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-neutral-50 p-4 rounded-xl">
                        <p className="text-xs text-neutral-500">WHT Total</p>
                        <p className="text-lg font-semibold text-neutral-900">${parseFloat(order.wht_total || 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-neutral-50 p-4 rounded-xl">
                        <p className="text-xs text-neutral-500">Grand Total</p>
                        <p className="text-lg font-semibold text-primary-600">${parseFloat(order.grand_total || 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-neutral-50 p-4 rounded-xl">
                        <p className="text-xs text-neutral-500">Cash Received</p>
                        <p className="text-lg font-semibold text-success-600">${parseFloat(order.cash_received || 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-neutral-50 p-4 rounded-xl">
                        <p className="text-xs text-neutral-500">Outstanding</p>
                        <p className="text-lg font-semibold text-error-600">${parseFloat(order.credit_outstanding || 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-neutral-50 p-4 rounded-xl">
                        <p className="text-xs text-neutral-500">Total Paid</p>
                        <p className="text-lg font-semibold text-success-600">${parseFloat(order.total_paid || 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-neutral-50 p-4 rounded-xl">
                        <p className="text-xs text-neutral-500">Remaining</p>
                        <p className="text-lg font-semibold text-warning-600">${parseFloat(order.remaining_amount || 0).toFixed(2)}</p>
                    </div>
                </div>
            </Card>

            {/* Items */}
            {order.items && order.items.length > 0 && (
                <Card>
                    <h3 className="font-semibold text-neutral-900 mb-4">Items</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-neutral-200">
                                    <th className="text-left py-3 text-sm font-medium text-neutral-500">Product</th>
                                    <th className="text-right py-3 text-sm font-medium text-neutral-500">Quantity</th>
                                    <th className="text-right py-3 text-sm font-medium text-neutral-500">Price</th>
                                    <th className="text-right py-3 text-sm font-medium text-neutral-500">Discount</th>
                                    <th className="text-right py-3 text-sm font-medium text-neutral-500">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.items.map((item) => (
                                    <tr key={item.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                                        <td className="py-3 text-sm text-neutral-900">
                                            <div>
                                                <div className="font-medium">{item.product_name || 'Unknown Product'}</div>
                                                <div className="text-xs text-neutral-500">Code: {item.product_code || 'N/A'}</div>
                                            </div>
                                        </td>
                                        <td className="py-3 text-sm text-neutral-900 text-right">{item.quantity || 0}</td>
                                        <td className="py-3 text-sm text-neutral-900 text-right">${parseFloat(item.effective_price || 0).toFixed(2)}</td>
                                        <td className="py-3 text-sm text-neutral-900 text-right">${parseFloat(item.discount || 0).toFixed(2)}</td>
                                        <td className="py-3 text-sm font-semibold text-neutral-900 text-right">${parseFloat(item.line_total || 0).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-neutral-200">
                                    <td colSpan="4" className="py-3 text-right font-semibold text-neutral-900">Grand Total</td>
                                    <td className="py-3 text-right font-bold text-primary-600">${parseFloat(order.grand_total || 0).toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Card>
            )}

            {/* Actions */}
            {order.status === 'draft' && (
                <div className="flex gap-3">
                    <Button variant="success" onClick={async () => {
                        if (window.confirm('Confirm this purchase order?')) {
                            try {
                                await purchaseOrdersApi.confirm(id);
                                await fetchOrder();
                            } catch (error) {
                                alert(error.response?.data?.detail || 'Failed to confirm order');
                            }
                        }
                    }}>
                        Confirm Order
                    </Button>
                    <Button variant="danger" onClick={async () => {
                        if (window.confirm('Delete this purchase order?')) {
                            try {
                                await purchaseOrdersApi.delete(id);
                                navigate('/purchases/orders');
                            } catch (error) {
                                alert(error.response?.data?.detail || 'Failed to delete order');
                            }
                        }
                    }}>
                        Delete Order
                    </Button>
                </div>
            )}
        </div>
    );
};

export default PurchaseOrderDetail;