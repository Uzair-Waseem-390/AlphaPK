import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { billingApi } from '../../services/billingApi';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import PaymentStatusBadge from '../../components/billing/PaymentStatusBadge';

const PaymentDetailPage = () => {
    const { paymentId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [payment, setPayment] = useState(null);
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [customer, setCustomer] = useState(null);

    useEffect(() => {
        fetchPaymentDetails();
    }, [paymentId]);

    const fetchPaymentDetails = async () => {
        setLoading(true);
        try {
            // First, get all payments and find the specific one
            const allPayments = await billingApi.payments.getAll();
            const foundPayment = allPayments.find(p => p.id === parseInt(paymentId));

            if (!foundPayment) {
                throw new Error('Payment not found');
            }

            setPayment(foundPayment);

            // Fetch invoice details
            if (foundPayment.invoice) {
                const invoiceData = await billingApi.invoices.getById(foundPayment.invoice);
                setInvoice(invoiceData);
                if (invoiceData.customer) {
                    setCustomer(invoiceData.customer);
                }
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
            await billingApi.payments.delete(paymentId);
            navigate('/billing/payments');
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
                <Link to="/billing/payments" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Payments
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link to="/billing/payments" className="text-sm text-primary-600 hover:text-primary-700">
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
                        <p className="text-sm text-neutral-500">Amount</p>
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

            {/* Related Invoice */}
            {invoice && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Related Invoice</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <p className="text-sm text-neutral-500">Bill Number</p>
                            <Link
                                to={`/billing/invoices/${invoice.id}`}
                                className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
                            >
                                {invoice.bill_number}
                            </Link>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Customer</p>
                            <p className="font-medium">{customer?.name || 'N/A'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Invoice Status</p>
                            <Badge variant={
                                invoice.status === 'confirmed' ? 'confirmed' :
                                    invoice.status === 'draft' ? 'draft' :
                                        'default'
                            }>
                                {invoice.status || 'N/A'}
                            </Badge>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Payment Status</p>
                            <PaymentStatusBadge status={invoice.payment_status} />
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Grand Total</p>
                            <p className="font-medium">
                                {typeof invoice.grand_total === 'string'
                                    ? parseFloat(invoice.grand_total).toFixed(2)
                                    : '0.00'}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Credit Outstanding</p>
                            <p className="font-medium text-error-600">
                                {typeof invoice.credit_outstanding === 'string'
                                    ? parseFloat(invoice.credit_outstanding).toFixed(2)
                                    : '0.00'}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Confirmed At</p>
                            <p className="font-medium">
                                {invoice.confirmed_at ? new Date(invoice.confirmed_at).toLocaleDateString() : 'N/A'}
                            </p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <Link to={`/billing/invoices/${invoice.id}`}>
                            <Button variant="secondary" size="sm">
                                View Full Invoice
                            </Button>
                        </Link>
                    </div>
                </Card>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-neutral-200">
                <Link to="/billing/payments">
                    <Button variant="secondary">
                        ← Back to Payments
                    </Button>
                </Link>
                {invoice && (
                    <Link to={`/billing/invoices/${invoice.id}`}>
                        <Button variant="secondary">
                            View Invoice
                        </Button>
                    </Link>
                )}
            </div>
        </div>
    );
};

export default PaymentDetailPage;