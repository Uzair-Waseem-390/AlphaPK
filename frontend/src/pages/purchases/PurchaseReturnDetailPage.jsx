import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import OrderStatusBadge from '../../components/purchases/OrderStatusBadge';
import OrderPaymentStatusBadge from '../../components/purchases/OrderPaymentStatusBadge';

const PurchaseReturnDetailPage = () => {
    const { returnId } = useParams();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [returnItem, setReturnItem] = useState(null);
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchReturnDetails();
    }, [returnId]);

    const fetchReturnDetails = async () => {
        setLoading(true);
        try {
            const returnsRes = await purchasesApi.returns.getAll({ page_size: 500 });
            const allReturns = returnsRes?.results ?? returnsRes ?? [];
            const foundReturn = allReturns.find(r => r.id === parseInt(returnId));

            if (foundReturn) {
                setReturnItem(foundReturn);

                try {
                    const orderData = await purchasesApi.orders.getById(foundReturn.order);
                    setOrder(orderData);
                } catch (orderError) {
                    console.error('Failed to fetch related order:', orderError);
                    setOrder(null);
                }
            } else {
                setReturnItem(null);
                setOrder(null);
            }
        } catch (error) {
            console.error('Failed to fetch return details:', error);
            setReturnItem(null);
            setOrder(null);
        } finally {
            setLoading(false);
        }
    };

    const handleAcceptReturn = async () => {
        if (!window.confirm('Are you sure you want to accept this return?')) return;
        try {
            await purchasesApi.returns.accept(returnId);
            await fetchReturnDetails();
            alert('Return accepted successfully!');
        } catch (error) {
            console.error('Failed to accept return:', error);
            alert(error.response?.data?.detail || 'Failed to accept return');
        }
    };

    const getStatusBadge = (status) => {
        const variants = {
            pending: 'pending',
            accepted: 'accepted',
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

    if (!returnItem) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Return Not Found</h2>
                <p className="text-neutral-500 mt-1">The return you're looking for doesn't exist.</p>
                <Link to="/purchases/returns" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Returns
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link to="/purchases/returns" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Returns
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Return Details</h1>
                    <div className="flex items-center gap-3 mt-1">
                        <p className="text-neutral-500">{returnItem.reference_number}</p>
                        {getStatusBadge(returnItem.status)}
                    </div>
                </div>
                <div className="flex gap-2">
                    {returnItem.status === 'pending' && isAdmin && (
                        <Button variant="success" onClick={handleAcceptReturn}>
                            Accept Return
                        </Button>
                    )}
                    <Link to="/purchases/returns">
                        <Button variant="secondary">
                            ← Back
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Return Information */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Return Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-sm text-neutral-500">Return Number</p>
                        <p className="font-medium">{returnItem.reference_number}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Status</p>
                        {getStatusBadge(returnItem.status)}
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Total Return Amount (PKR)</p>
                        <p className="font-medium text-primary-600">
                            {typeof returnItem.total_return_amount === 'string'
                                ? parseFloat(returnItem.total_return_amount).toFixed(2)
                                : '0.00'}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Created</p>
                        <p className="font-medium">{new Date(returnItem.created_at).toLocaleString()}</p>
                    </div>
                    {returnItem.total_return_gross && parseFloat(returnItem.total_return_gross) > 0 && (
                        <div>
                            <p className="text-sm text-neutral-500">Gross Amount (PKR)</p>
                            <p className="font-medium">{parseFloat(returnItem.total_return_gross).toFixed(2)}</p>
                        </div>
                    )}
                    {returnItem.total_return_gst && parseFloat(returnItem.total_return_gst) > 0 && (
                        <div>
                            <p className="text-sm text-neutral-500">GST Amount (PKR)</p>
                            <p className="font-medium">{parseFloat(returnItem.total_return_gst).toFixed(2)}</p>
                        </div>
                    )}
                    {returnItem.total_return_wht && parseFloat(returnItem.total_return_wht) > 0 && (
                        <div>
                            <p className="text-sm text-neutral-500">WHT Amount (PKR)</p>
                            <p className="font-medium">{parseFloat(returnItem.total_return_wht).toFixed(2)}</p>
                        </div>
                    )}
                    {returnItem.accepted_at && (
                        <div>
                            <p className="text-sm text-neutral-500">Accepted</p>
                            <p className="font-medium">{new Date(returnItem.accepted_at).toLocaleString()}</p>
                        </div>
                    )}
                    {returnItem.accepted_by && (
                        <div>
                            <p className="text-sm text-neutral-500">Accepted By</p>
                            <p className="font-medium">{returnItem.accepted_by}</p>
                        </div>
                    )}
                    {returnItem.note && (
                        <div className="col-span-full">
                            <p className="text-sm text-neutral-500">Note</p>
                            <p className="font-medium">{returnItem.note}</p>
                        </div>
                    )}
                </div>
            </Card>

            {/* Return Items */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Returned Items</h3>
                {returnItem.items && returnItem.items.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-neutral-200">
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Product</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Quantity</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Unit Price</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">GST%</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">WHT%</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {returnItem.items.map((item, index) => (
                                    <tr key={item.id || index} className="hover:bg-neutral-50">
                                        <td className="px-3 py-2 text-sm">{item.product_name}</td>
                                        <td className="px-3 py-2 text-sm">{item.quantity}</td>
                                        <td className="px-3 py-2 text-sm">
                                            {typeof item.unit_price === 'string'
                                                ? parseFloat(item.unit_price).toFixed(2)
                                                : '0.00'}
                                        </td>
                                        <td className="px-3 py-2 text-sm">{item.gst || 0}%</td>
                                        <td className="px-3 py-2 text-sm">{item.wht || 0}%</td>
                                        <td className="px-3 py-2 text-sm text-right font-medium">
                                            {typeof item.total_amount === 'string'
                                                ? parseFloat(item.total_amount).toFixed(2)
                                                : '0.00'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="border-t border-neutral-200">
                                <tr className="text-lg">
                                    <td colSpan="5" className="px-3 py-2 text-right font-bold">Total Return Amount:</td>
                                    <td className="px-3 py-2 text-right font-bold text-primary-600">
                                        {typeof returnItem.total_return_amount === 'string'
                                            ? parseFloat(returnItem.total_return_amount).toFixed(2)
                                            : '0.00'}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                ) : (
                    <p className="text-center text-neutral-500 py-4">No items in this return</p>
                )}
            </Card>

            {/* Related Order */}
            {order && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Related Order</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <p className="text-sm text-neutral-500">Order Number</p>
                            <Link
                                to={`/purchases/orders/${order.id}`}
                                className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
                            >
                                {order.order_number}
                            </Link>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Supplier</p>
                            <p className="font-medium">{order.supplier?.name || 'N/A'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Order Status</p>
                            <OrderStatusBadge status={order.status} />
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Payment Status</p>
                            <OrderPaymentStatusBadge status={order.payment_status} />
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Net Payable</p>
                            <p className="font-medium">
                                {typeof order.net_payable === 'string'
                                    ? parseFloat(order.net_payable).toFixed(2)
                                    : '0.00'}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Confirmed At</p>
                            <p className="font-medium">
                                {order.confirmed_at ? new Date(order.confirmed_at).toLocaleDateString() : 'N/A'}
                            </p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <Link to={`/purchases/orders/${order.id}`}>
                            <Button variant="secondary" size="sm">
                                View Full Order
                            </Button>
                        </Link>
                    </div>
                </Card>
            )}

            {/* Actions */}
            {returnItem.status === 'pending' && isAdmin && (
                <div className="flex gap-3 pt-4 border-t border-neutral-200">
                    <Button variant="success" onClick={handleAcceptReturn}>
                        Accept Return
                    </Button>
                </div>
            )}
        </div>
    );
};

export default PurchaseReturnDetailPage;
