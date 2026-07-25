import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cashManagementApi } from '../../services/cashManagementApi';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const OwnerTransactionDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [txn, setTxn] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    useEffect(() => {
        fetchTxn();
    }, [id]);

    const fetchTxn = async () => {
        setLoading(true);
        try {
            const data = await cashManagementApi.ownerTransactions.getById(id);
            setTxn(data);
        } catch (error) {
            console.error('Failed to fetch owner transaction:', error);
            setTxn(null);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        try {
            await cashManagementApi.ownerTransactions.delete(id);
            navigate('/cash-management/owner-transactions');
        } catch (error) {
            console.error('Failed to delete owner transaction:', error);
        }
    };

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view owner transactions.</p>
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

    if (!txn) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Owner Transaction Not Found</h2>
                <Link to="/cash-management/owner-transactions" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Owner Transactions
                </Link>
            </div>
        );
    }

    const isContribution = txn.transaction_type === 'contribution';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link to="/cash-management/owner-transactions" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Owner Transactions
                    </Link>
                    <div className="flex items-center gap-3 mt-1">
                        <h1 className="text-3xl font-bold text-neutral-900">Owner Transaction Details</h1>
                        {isContribution ? <Badge variant="success">Contribution</Badge> : <Badge variant="warning">Drawing</Badge>}
                    </div>
                    <p className="text-neutral-500">Rs. {fmt(txn.amount)}</p>
                </div>
                <Button variant="danger" onClick={() => setDeleteConfirm(true)}>
                    Delete
                </Button>
            </div>

            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Transaction Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <p className="text-sm text-neutral-500">Amount</p>
                        <p className={`text-xl font-bold ${isContribution ? 'text-success-600' : 'text-warning-700'}`}>
                            Rs. {fmt(txn.amount)}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Date</p>
                        <p className="font-medium">{new Date(txn.transaction_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Recorded By</p>
                        <p className="font-medium">{txn.created_by || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Created At</p>
                        <p className="font-medium">{new Date(txn.created_at).toLocaleString()}</p>
                    </div>
                    {txn.note && (
                        <div className="col-span-full">
                            <p className="text-sm text-neutral-500">Note</p>
                            <p className="font-medium">{txn.note}</p>
                        </div>
                    )}
                </div>
            </Card>

            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Cash Impact</h3>
                <div className={`p-4 rounded-lg ${isContribution ? 'bg-green-50' : 'bg-amber-50'}`}>
                    <p className={isContribution ? 'text-green-700' : 'text-amber-700'}>
                        This {isContribution ? 'increased' : 'reduced'} cash in hand by <strong>Rs. {fmt(txn.amount)}</strong>
                    </p>
                    <p className={`text-sm mt-1 ${isContribution ? 'text-green-600' : 'text-amber-600'}`}>
                        Recorded on {new Date(txn.transaction_date).toLocaleDateString()}
                    </p>
                </div>
            </Card>

            <div className="flex gap-3 pt-4 border-t border-neutral-200">
                <Link to="/cash-management/owner-transactions">
                    <Button variant="secondary">← Back to Owner Transactions</Button>
                </Link>
                <Button variant="danger" onClick={() => setDeleteConfirm(true)}>
                    Delete Transaction
                </Button>
            </div>

            <ConfirmDialog
                isOpen={deleteConfirm}
                onClose={() => setDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="Delete Owner Transaction"
                message={`Are you sure you want to delete this Rs. ${fmt(txn.amount)} ${txn.transaction_type}? This will reverse its effect on cash in hand.`}
            />
        </div>
    );
};

export default OwnerTransactionDetailPage;
