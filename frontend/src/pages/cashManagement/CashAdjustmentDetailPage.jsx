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

const CashAdjustmentDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [adjustment, setAdjustment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    useEffect(() => {
        fetchAdjustment();
    }, [id]);

    const fetchAdjustment = async () => {
        setLoading(true);
        try {
            const data = await cashManagementApi.adjustments.getById(id);
            setAdjustment(data);
        } catch (error) {
            console.error('Failed to fetch cash adjustment:', error);
            setAdjustment(null);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        try {
            await cashManagementApi.adjustments.delete(id);
            navigate('/cash-management/adjustments');
        } catch (error) {
            console.error('Failed to delete cash adjustment:', error);
        }
    };

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view cash adjustments.</p>
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

    if (!adjustment) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Cash Adjustment Not Found</h2>
                <p className="text-neutral-500 mt-1">The record you're looking for doesn't exist.</p>
                <Link to="/cash-management/adjustments" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Cash Adjustments
                </Link>
            </div>
        );
    }

    const isLost = adjustment.adjustment_type === 'lost';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link to="/cash-management/adjustments" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Cash Adjustments
                    </Link>
                    <div className="flex items-center gap-3 mt-1">
                        <h1 className="text-3xl font-bold text-neutral-900">Cash Adjustment Details</h1>
                        {isLost ? <Badge variant="error">Lost</Badge> : <Badge variant="success">Found</Badge>}
                    </div>
                    <p className="text-neutral-500">Rs. {fmt(adjustment.amount)}</p>
                </div>
                <Button variant="danger" onClick={() => setDeleteConfirm(true)}>
                    Delete
                </Button>
            </div>

            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Adjustment Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <p className="text-sm text-neutral-500">Amount</p>
                        <p className={`text-xl font-bold ${isLost ? 'text-error-600' : 'text-success-600'}`}>
                            Rs. {fmt(adjustment.amount)}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Date</p>
                        <p className="font-medium">{new Date(adjustment.adjustment_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Recorded By</p>
                        <p className="font-medium">{adjustment.created_by || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Created At</p>
                        <p className="font-medium">{new Date(adjustment.created_at).toLocaleString()}</p>
                    </div>
                    {adjustment.reason && (
                        <div className="col-span-full">
                            <p className="text-sm text-neutral-500">Reason</p>
                            <p className="font-medium">{adjustment.reason}</p>
                        </div>
                    )}
                </div>
            </Card>

            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Cash Impact</h3>
                <div className={`p-4 rounded-lg ${isLost ? 'bg-amber-50' : 'bg-green-50'}`}>
                    <p className={isLost ? 'text-amber-700' : 'text-green-700'}>
                        This {isLost ? 'reduced' : 'increased'} cash in hand by <strong>Rs. {fmt(adjustment.amount)}</strong>
                    </p>
                    <p className={`text-sm mt-1 ${isLost ? 'text-amber-600' : 'text-green-600'}`}>
                        Recorded on {new Date(adjustment.adjustment_date).toLocaleDateString()}
                    </p>
                </div>
            </Card>

            <div className="flex gap-3 pt-4 border-t border-neutral-200">
                <Link to="/cash-management/adjustments">
                    <Button variant="secondary">← Back to Cash Adjustments</Button>
                </Link>
                <Button variant="danger" onClick={() => setDeleteConfirm(true)}>
                    Delete Adjustment
                </Button>
            </div>

            <ConfirmDialog
                isOpen={deleteConfirm}
                onClose={() => setDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="Delete Cash Adjustment"
                message={`Are you sure you want to delete this Rs. ${fmt(adjustment.amount)} ${adjustment.adjustment_type} entry? This will reverse its effect on cash in hand.`}
            />
        </div>
    );
};

export default CashAdjustmentDetailPage;
