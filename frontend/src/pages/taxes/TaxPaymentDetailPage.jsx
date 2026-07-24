import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { taxesApi } from '../../services/taxesApi';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const TaxPaymentDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [payment, setPayment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    useEffect(() => {
        fetchPayment();
    }, [id]);

    const fetchPayment = async () => {
        setLoading(true);
        try {
            const data = await taxesApi.payments.getById(id);
            setPayment(data);
        } catch (error) {
            console.error('Failed to fetch tax payment:', error);
            setPayment(null);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        try {
            await taxesApi.payments.delete(id);
            navigate('/taxes/payments');
        } catch (error) {
            console.error('Failed to delete tax payment:', error);
        }
    };

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view tax payments.</p>
            </div>
        );
    }

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
                <h2 className="text-2xl font-semibold text-neutral-900">Tax Payment Not Found</h2>
                <p className="text-neutral-500 mt-1">The tax payment you're looking for doesn't exist.</p>
                <Link to="/taxes/payments" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Tax Payments
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link to="/taxes/payments" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Tax Payments
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Tax Payment Details</h1>
                    <p className="text-neutral-500">Rs. {fmt(payment.amount)} paid to FBR</p>
                </div>
                <Button variant="danger" onClick={() => setDeleteConfirm(true)}>
                    Delete
                </Button>
            </div>

            {/* Payment Information */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Payment Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <p className="text-sm text-neutral-500">Amount</p>
                        <p className="text-xl font-bold text-error-600">Rs. {fmt(payment.amount)}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Payment Date</p>
                        <p className="font-medium">{new Date(payment.payment_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Recorded By</p>
                        <p className="font-medium">{payment.created_by || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Created At</p>
                        <p className="font-medium">{new Date(payment.created_at).toLocaleString()}</p>
                    </div>
                    {payment.updated_by && (
                        <div>
                            <p className="text-sm text-neutral-500">Updated By</p>
                            <p className="font-medium">{payment.updated_by}</p>
                        </div>
                    )}
                    {payment.updated_at && payment.updated_at !== payment.created_at && (
                        <div>
                            <p className="text-sm text-neutral-500">Updated At</p>
                            <p className="font-medium">{new Date(payment.updated_at).toLocaleString()}</p>
                        </div>
                    )}
                    {payment.note && (
                        <div className="col-span-full">
                            <p className="text-sm text-neutral-500">Note</p>
                            <p className="font-medium">{payment.note}</p>
                        </div>
                    )}
                </div>
            </Card>

            {/* Cash Impact */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Cash Impact</h3>
                <div className="p-4 bg-amber-50 rounded-lg">
                    <p className="text-amber-700">
                        This payment reduced cash in hand by <strong>Rs. {fmt(payment.amount)}</strong>
                    </p>
                    <p className="text-sm text-amber-600 mt-1">
                        Paid on {new Date(payment.payment_date).toLocaleDateString()}
                    </p>
                </div>
            </Card>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-neutral-200">
                <Link to="/taxes/payments">
                    <Button variant="secondary">← Back to Tax Payments</Button>
                </Link>
                <Button variant="danger" onClick={() => setDeleteConfirm(true)}>
                    Delete Tax Payment
                </Button>
            </div>

            <ConfirmDialog
                isOpen={deleteConfirm}
                onClose={() => setDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="Delete Tax Payment"
                message={`Are you sure you want to delete this Rs. ${fmt(payment.amount)} tax payment? This will restore the amount to cash in hand.`}
            />
        </div>
    );
};

export default TaxPaymentDetailPage;
