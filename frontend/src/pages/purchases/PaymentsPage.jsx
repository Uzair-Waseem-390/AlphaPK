import { useState, useEffect } from 'react';
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
import Pagination from '../../components/ui/Pagination';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useParams, Link, useNavigate } from 'react-router-dom';

const PaymentsPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
    const { orderId } = useParams();
    const navigate = useNavigate();

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [paymentSummary, setPaymentSummary] = useState(null);
    const [orderDetails, setOrderDetails] = useState(null);
    const [formData, setFormData] = useState({
        amount: '',
        method: 'cash',
        payment_date: new Date().toISOString().split('T')[0],
        note: '',
    });
    const [formLoading, setFormLoading] = useState(false);

    const fetchPaymentsPage = (params) => {
        if (!orderId || orderId === 'undefined') {
            return Promise.resolve({ results: [], count: 0, total_pages: 1, current_page: 1, page_size: 25 });
        }
        return purchasesApi.payments.getByOrder(orderId, params);
    };

    const {
        data: payments, meta, page, setPage, loading,
        filters, setFilters, refetch: fetchPayments,
    } = usePaginatedList(fetchPaymentsPage, {}, 25, [orderId]);

    useEffect(() => {
        if (orderId && orderId !== 'undefined') {
            fetchSummary();
            fetchOrderDetails();
        }
    }, [orderId]);

    const fetchSummary = async () => {
        if (!orderId || orderId === 'undefined') return;
        try {
            const data = await purchasesApi.orders.getPaymentSummary(orderId);
            setPaymentSummary(data);
        } catch (error) {
            console.error('Failed to fetch payment summary:', error);
        }
    };

    const fetchOrderDetails = async () => {
        if (!orderId || orderId === 'undefined') return;
        try {
            const data = await purchasesApi.orders.getById(orderId);
            setOrderDetails(data);
        } catch (error) {
            console.error('Failed to fetch order details:', error);
        }
    };

    const handleCreatePayment = async (e) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            const paymentData = {
                order: parseInt(orderId),
                amount: parseFloat(formData.amount),
                method: formData.method,
                payment_date: formData.payment_date,
                note: formData.note || '',
            };

            await purchasesApi.payments.create(orderId, paymentData);
            setShowCreateModal(false);
            resetForm();
            fetchPayments();
            fetchSummary();
            alert('Payment recorded successfully!');
        } catch (error) {
            console.error('Failed to create payment:', error);
            let errorMessage = 'Failed to record payment';

            if (error.response?.data) {
                const errorData = error.response.data;
                if (typeof errorData === 'object') {
                    const messages = Object.entries(errorData)
                        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                        .join('\n');
                    errorMessage = `Validation Error:\n${messages}`;
                } else if (typeof errorData === 'string') {
                    errorMessage = errorData;
                }
            } else if (error.message) {
                errorMessage = error.message;
            }

            alert(errorMessage);
        } finally {
            setFormLoading(false);
        }
    };

    const handleDeletePayment = async (paymentId) => {
        if (!window.confirm('Are you sure you want to delete this payment?')) return;

        try {
            await purchasesApi.payments.delete(paymentId);
            fetchPayments();
            fetchSummary();
        } catch (error) {
            console.error('Failed to delete payment:', error);
        }
    };

    const resetForm = () => {
        setFormData({
            amount: '',
            method: 'cash',
            payment_date: new Date().toISOString().split('T')[0],
            note: '',
        });
    };

    const columns = [
        { key: 'reference_number', label: 'Reference', width: '140px' },
        {
            key: 'amount',
            label: 'Amount (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
        },
        {
            key: 'method_display',
            label: 'Method',
            render: (value) => <Badge>{value || 'N/A'}</Badge>
        },
        { key: 'payment_date', label: 'Date', render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A' },
        { key: 'note', label: 'Note', render: (value) => value || '-' },
        {
            key: 'actions',
            label: 'Actions',
            width: '120px',
            render: (_, row) => (
                <div className="flex items-center gap-3">
                    <Link
                        to={`/purchases/payments/ref/${row.reference_number}`}
                        className="text-primary-600 hover:text-primary-700 text-sm"
                    >
                        View
                    </Link>
                    {isAdmin && (
                        <button
                            onClick={() => handleDeletePayment(row.id)}
                            className="text-error-600 hover:text-error-700 text-sm"
                        >
                            Delete
                        </button>
                    )}
                </div>
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
                    <h1 className="text-3xl font-bold text-neutral-900">Order Payments</h1>
                    <p className="text-neutral-500 mt-1">
                        Manage payments for Order #{orderDetails?.order_number || orderId}
                    </p>
                    <div className="flex gap-4 mt-2">
                        <Link to="/purchases/orders" className="text-sm text-primary-600 hover:text-primary-700">
                            ← Back to Orders
                        </Link>
                        <Link to="/purchases/payments" className="text-sm text-primary-600 hover:text-primary-700">
                            View All Payments →
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
                        Record Payment
                    </Button>
                )}
            </div>

            {paymentSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Net Payable</p>
                        <p className="text-xl font-bold text-neutral-900">
                            {typeof paymentSummary.net_payable === 'string'
                                ? parseFloat(paymentSummary.net_payable).toFixed(2)
                                : '0.00'}
                        </p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Total Paid</p>
                        <p className="text-xl font-bold text-success-600">
                            {typeof paymentSummary.total_paid === 'string'
                                ? parseFloat(paymentSummary.total_paid).toFixed(2)
                                : '0.00'}
                        </p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Outstanding</p>
                        <p className="text-xl font-bold text-error-600">
                            {typeof paymentSummary.payable_outstanding === 'string'
                                ? parseFloat(paymentSummary.payable_outstanding).toFixed(2)
                                : '0.00'}
                        </p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Payment Status</p>
                        <Badge variant={paymentSummary.payment_status === 'paid' ? 'paid' :
                            paymentSummary.payment_status === 'partial' ? 'partial' : 'unpaid'}>
                            {paymentSummary.payment_status_display || paymentSummary.payment_status || 'N/A'}
                        </Badge>
                    </Card>
                </div>
            )}

            <div className="flex gap-4">
                <SearchBar
                    onSearch={(value) => setFilters({ ...filters, reference: value })}
                    placeholder="Search payments by reference number..."
                    className="flex-1"
                />
            </div>

            <Table
                columns={columns}
                data={payments}
            />

            {meta.totalPages > 1 && (
                <Pagination
                    currentPage={meta.currentPage}
                    totalPages={meta.totalPages}
                    onPageChange={setPage}
                />
            )}

            <Modal
                isOpen={showCreateModal}
                onClose={() => {
                    setShowCreateModal(false);
                    resetForm();
                }}
                title="Record Payment"
            >
                <form onSubmit={handleCreatePayment} className="space-y-4">
                    <Input
                        label="Amount (PKR)"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        placeholder="Enter amount"
                        required
                    />

                    <Select
                        label="Payment Method"
                        value={formData.method}
                        onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                        options={[
                            { value: 'cash', label: 'Cash' },
                            { value: 'jazzcash', label: 'JazzCash' },
                            { value: 'easypaisa', label: 'Easypaisa' },
                            { value: 'bank', label: 'Bank Transfer' },
                        ]}
                        required
                    />

                    <Input
                        label="Payment Date"
                        type="date"
                        value={formData.payment_date}
                        onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                        required
                    />

                    <Input
                        label="Note"
                        value={formData.note}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        placeholder="Payment note (optional)"
                    />

                    <div className="flex justify-end gap-3 pt-4">
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
                            Record Payment
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default PaymentsPage;