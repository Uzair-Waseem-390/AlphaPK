import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import OrderStatusBadge from '../../components/purchases/OrderStatusBadge';
import OrderPaymentStatusBadge from '../../components/purchases/OrderPaymentStatusBadge';

const PurchasePaymentDetailPage = () => {
    const { reference } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [payment, setPayment] = useState(null);
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPaymentDetails();
    }, [reference]);

    const fetchPaymentDetails = async () => {
        setLoading(true);
        try {
            const payments = await purchasesApi.payments.getAll({ reference });
            const foundPayment = payments?.[0];

            if (!foundPayment) {
                throw new Error('Payment not found');
            }

            setPayment(foundPayment);

            if (foundPayment.order) {
                const orderData = await purchasesApi.orders.getById(foundPayment.order);
                setOrder(orderData);
            }
        } catch (error) {
            console.error('Failed to fetch payment details:', error);
            setPayment(null);
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePayment = async () => {
        if (!window.confirm('Are you sure you want to delete this payment?')) return;
        try {
            await purchasesApi.payments.delete(payment.id);
            navigate('/purchases/payments');
        } catch (error) {
            console.error('Failed to delete payment:', error);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!payment) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Payment Not Found</h2>
                <p className="text-neutral-500 mt-1">The payment you're looking for doesn't exist.</p>
                <Link to="/purchases/payments" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Payments
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link to="/purchases/payments" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Payments
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Payment Details</h1>
                    <p className="text-neutral-500">{payment.reference_number}</p>
                </div>
                {isAdmin && (
                    <Button variant="danger" onClick={handleDeletePayment}>
                        Delete Payment
                    </Button>
                )}
            </div>

            {/* Payment Info */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Payment Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <p className="text-sm text-neutral-500">Reference Number</p>
                        <p className="font-medium">{payment.reference_number}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Amount (PKR)</p>
                        <p className="text-xl font-bold text-success-600">
                            {typeof payment.amount === 'string'
                                ? parseFloat(payment.amount).toFixed(2)
                                : '0.00'}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Method</p>
                        <Badge>{payment.method_display || payment.method || 'N/A'}</Badge>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Payment Date</p>
                        <p className="font-medium">{new Date(payment.payment_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Created By</p>
                        <p className="font-medium">{payment.created_by || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Created At</p>
                        <p className="font-medium">{new Date(payment.created_at).toLocaleString()}</p>
                    </div>
                    {payment.note && (
                        <div className="col-span-full">
                            <p className="text-sm text-neutral-500">Note</p>
                            <p className="font-medium">{payment.note}</p>
                        </div>
                    )}
                </div>
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
                            <p className="text-sm text-neutral-500">Payable Outstanding</p>
                            <p className="font-medium text-error-600">
                                {typeof order.payable_outstanding === 'string'
                                    ? parseFloat(order.payable_outstanding).toFixed(2)
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
            <div className="flex gap-3 pt-4 border-t border-neutral-200">
                <Link to="/purchases/payments">
                    <Button variant="secondary">
                        ← Back to Payments
                    </Button>
                </Link>
                {order && (
                    <Link to={`/purchases/orders/${order.id}`}>
                        <Button variant="secondary">
                            View Order
                        </Button>
                    </Link>
                )}
            </div>
        </div>
    );
};

export default PurchasePaymentDetailPage;
