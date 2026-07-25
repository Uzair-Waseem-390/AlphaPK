import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { recurringExpensesApi } from '../../services/recurringExpensesApi';
import { useRecurringExpensePayments } from '../../hooks/useRecurringExpenses';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const statusBadge = (status) => {
    if (status === 'paid') return <Badge variant="success">Paid</Badge>;
    if (status === 'partial') return <Badge variant="warning">Partial</Badge>;
    return <Badge variant="error">Unpaid</Badge>;
};

const RecurringExpenseAssignmentDetailPage = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [assignment, setAssignment] = useState(null);
    const [loading, setLoading] = useState(true);

    const {
        data: payments, meta, page, setPage, loading: paymentsLoading,
        refetch: refetchPayments, create, delete: deletePayment,
    } = useRecurringExpensePayments({ assignment_id: id });

    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        amount: '', payment_date: new Date().toISOString().split('T')[0], note: '',
    });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        fetchAssignment();
    }, [id]);

    const fetchAssignment = async () => {
        setLoading(true);
        try {
            const data = await recurringExpensesApi.assignments.getById(id);
            setAssignment(data);
        } catch (error) {
            console.error('Failed to fetch assignment:', error);
            setAssignment(null);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({ amount: '', payment_date: new Date().toISOString().split('T')[0], note: '' });
        setFormError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormLoading(true);
        try {
            await create({ ...formData, assignment: id, amount: parseFloat(formData.amount) });
            setShowModal(false);
            resetForm();
            await Promise.all([refetchPayments(), fetchAssignment()]);
        } catch (error) {
            setFormError(error.response?.data?.detail || error.response?.data?.amount?.[0] || 'Failed to record payment');
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (paymentId) => {
        try {
            await deletePayment(paymentId);
            setDeleteConfirm(null);
            await Promise.all([refetchPayments(), fetchAssignment()]);
        } catch (error) {
            setDeleteConfirm(null);
            alert(error.response?.data?.detail || 'Failed to delete payment');
        }
    };

    const columns = [
        { key: 'payment_date', label: 'Date', render: (v) => new Date(v).toLocaleDateString() },
        { key: 'amount', label: 'Amount (PKR)', render: (v) => <span className="font-semibold text-success-600">Rs. {fmt(v)}</span> },
        { key: 'note', label: 'Note', render: (v) => v || <span className="text-neutral-300">—</span> },
        {
            key: 'actions',
            label: 'Actions',
            width: '100px',
            render: (_v, row) => (
                <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(row); }}
                    className="text-error-600 hover:text-error-700 text-sm"
                >
                    Delete
                </button>
            ),
        },
    ];

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view this.</p>
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

    if (!assignment) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Assignment Not Found</h2>
                <Link to="/recurring-expenses/assignments" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Assignments
                </Link>
            </div>
        );
    }

    const amountPending = parseFloat(assignment.amount) - parseFloat(assignment.amount_paid);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <Link to="/recurring-expenses/assignments" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Assignments
                    </Link>
                    <div className="flex items-center gap-3 mt-1">
                        <h1 className="text-3xl font-bold text-neutral-900">{assignment.name_snapshot}</h1>
                        {statusBadge(assignment.payment_status)}
                    </div>
                    <p className="text-neutral-500">{assignment.category_name_snapshot} · {assignment.period}</p>
                </div>
                {amountPending > 0 && (
                    <Button onClick={() => { resetForm(); setShowModal(true); }}>Record Payment</Button>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                    <p className="text-xs text-neutral-500 mb-1">Assigned Amount</p>
                    <p className="text-xl font-bold text-info-600">Rs. {fmt(assignment.amount)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs text-neutral-500 mb-1">Paid</p>
                    <p className="text-xl font-bold text-success-600">Rs. {fmt(assignment.amount_paid)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs text-neutral-500 mb-1">Pending</p>
                    <p className="text-xl font-bold text-warning-700">Rs. {fmt(amountPending)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs text-neutral-500 mb-1">Assigned On</p>
                    <p className="text-xl font-bold text-neutral-900">{new Date(assignment.assigned_at).toLocaleDateString()}</p>
                </Card>
            </div>

            {assignment.note && (
                <Card className="p-4">
                    <p className="text-sm text-neutral-500">Note</p>
                    <p className="font-medium">{assignment.note}</p>
                </Card>
            )}

            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Payment History</h2>
                {paymentsLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : payments.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-6xl mb-4">💵</div>
                        <h3 className="text-lg font-semibold text-neutral-900">No Payments Yet</h3>
                        <p className="text-sm text-neutral-500 mt-1">Record a payment to reduce the pending balance.</p>
                    </div>
                ) : (
                    <>
                        <Table columns={columns} data={payments} />
                        {meta.totalPages > 1 && (
                            <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                        )}
                    </>
                )}
            </div>

            <Modal
                isOpen={showModal}
                onClose={() => { setShowModal(false); resetForm(); }}
                title="Record Payment"
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <p className="text-sm text-neutral-500">
                        Outstanding balance: <strong>Rs. {fmt(amountPending)}</strong>
                    </p>
                    <Input
                        label="Amount (PKR)"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={amountPending}
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
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
                        placeholder="Optional"
                    />

                    {formError && (
                        <div className="p-3 bg-error-50 border border-error-200 rounded-lg">
                            <p className="text-sm text-error-600">{formError}</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={formLoading}>
                            Record Payment
                        </Button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete Payment"
                message={`Are you sure you want to delete this Rs. ${fmt(deleteConfirm?.amount)} payment? This will restore cash in hand and this assignment's pending balance.`}
            />
        </div>
    );
};

export default RecurringExpenseAssignmentDetailPage;
