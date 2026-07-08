import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { purchasesApi } from '../../services/purchasesApi';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const PurchasePaymentDetailPage = () => {
    const { reference } = useParams();
    const navigate = useNavigate();
    const [payment, setPayment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchPayment = async () => {
            setLoading(true);
            try {
                // Fetch all payments matching this reference
                const response = await purchasesApi.payments.getAll({ reference });
                if (response && response.length > 0) {
                    setPayment(response[0]);
                } else {
                    setError("No payment found.");
                }
            } catch (err) {
                console.error("Failed to fetch payment details:", err);
                setError("Failed to fetch payment details.");
            } finally {
                setLoading(false);
            }
        };

        if (reference) {
            fetchPayment();
        }
    }, [reference]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (error || !payment) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-bold text-neutral-900 mb-2">Payment Not Found</h2>
                <p className="text-neutral-500 mb-6">{error || "The payment you're looking for doesn't exist."}</p>
                <button
                    onClick={() => navigate(-1)}
                    className="text-primary-600 hover:text-primary-700 font-medium"
                >
                    ← Go Back
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <button
                        onClick={() => navigate(-1)}
                        className="text-sm text-neutral-500 hover:text-neutral-700 mb-2 inline-flex items-center"
                    >
                        ← Back
                    </button>
                    <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-3">
                        Payment Details
                        <Badge variant="success">Completed</Badge>
                    </h1>
                    <p className="text-neutral-500 mt-1">
                        Reference: {payment.reference_number}
                    </p>
                </div>
                <Link
                    to={`/purchases/orders/${payment.order}`}
                    className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-md hover:bg-neutral-200 transition-colors"
                >
                    View Purchase Order
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-neutral-900 mb-4 border-b pb-2">
                        Payment Information
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-neutral-500">Amount Paid</p>
                            <p className="text-2xl font-bold text-primary-600">
                                PKR {parseFloat(payment.amount).toFixed(2)}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-neutral-500">Date</p>
                                <p className="font-medium text-neutral-900">
                                    {new Date(payment.payment_date).toLocaleDateString()}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Method</p>
                                <p className="font-medium text-neutral-900 capitalize">
                                    {payment.method_display || payment.method}
                                </p>
                            </div>
                        </div>
                        {payment.note && (
                            <div>
                                <p className="text-sm text-neutral-500">Note</p>
                                <p className="text-neutral-900 mt-1 bg-neutral-50 p-3 rounded-md border border-neutral-100">
                                    {payment.note}
                                </p>
                            </div>
                        )}
                    </div>
                </Card>

                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-neutral-900 mb-4 border-b pb-2">
                        Order Information
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-neutral-500">Purchase Order</p>
                            <Link 
                                to={`/purchases/orders/${payment.order}`}
                                className="text-primary-600 hover:text-primary-700 font-medium"
                            >
                                #{payment.order}
                            </Link>
                        </div>
                        {payment.supplier_name && (
                            <div>
                                <p className="text-sm text-neutral-500">Supplier</p>
                                <p className="font-medium text-neutral-900">
                                    {payment.supplier_name}
                                </p>
                            </div>
                        )}
                        <div>
                            <p className="text-sm text-neutral-500">Recorded By</p>
                            <p className="font-medium text-neutral-900">
                                {payment.created_by_name || 'System'}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Recorded At</p>
                            <p className="font-medium text-neutral-900">
                                {new Date(payment.created_at).toLocaleString()}
                            </p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default PurchasePaymentDetailPage;
