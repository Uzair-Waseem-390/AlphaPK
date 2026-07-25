import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCashManagementStats, useCashAdjustments } from '../../hooks/useCashManagement';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import FilterBar from '../../components/ui/FilterBar';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const CashAdjustmentsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const {
        data: adjustments, meta, page, setPage, loading,
        filters, setFilters, refetch, create, delete: deleteAdjustment,
    } = useCashAdjustments();
    const { refetch: refetchStats } = useCashManagementStats();

    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        amount: '',
        adjustment_type: 'lost',
        adjustment_date: new Date().toISOString().split('T')[0],
        reason: '',
    });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [showFilters, setShowFilters] = useState(false);

    const resetForm = () => {
        setFormData({
            amount: '', adjustment_type: 'lost',
            adjustment_date: new Date().toISOString().split('T')[0], reason: '',
        });
        setFormError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormLoading(true);
        try {
            await create({ ...formData, amount: parseFloat(formData.amount) });
            setShowModal(false);
            resetForm();
            refetch();
            refetchStats();
        } catch (error) {
            setFormError(error.response?.data?.detail || error.response?.data?.amount?.[0] || 'Failed to record cash adjustment');
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (id) => {
        await deleteAdjustment(id);
        setDeleteConfirm(null);
        refetch();
        refetchStats();
    };

    const handleApplyFilters = (values) => setFilters(values);
    const handleResetFilters = () => setFilters({});
    const handleRowClick = (row) => navigate(`/cash-management/adjustments/${row.id}`);

    const filterConfig = [
        { name: 'adjustment_type', label: 'Type', type: 'select', options: [
            { value: '', label: 'All' },
            { value: 'lost', label: 'Lost' },
            { value: 'found', label: 'Found' },
        ] },
        { name: 'date_from', label: 'Date From', type: 'date' },
        { name: 'date_to', label: 'Date To', type: 'date' },
        { name: 'min_amount', label: 'Min Amount', type: 'number' },
        { name: 'max_amount', label: 'Max Amount', type: 'number' },
    ];

    const columns = [
        {
            key: 'adjustment_date',
            label: 'Date',
            render: (value) => new Date(value).toLocaleDateString(),
        },
        {
            key: 'adjustment_type',
            label: 'Type',
            render: (value) => value === 'lost'
                ? <Badge variant="error" size="sm">Lost</Badge>
                : <Badge variant="success" size="sm">Found</Badge>,
        },
        {
            key: 'amount',
            label: 'Amount (PKR)',
            render: (value, row) => (
                <span className={`font-semibold ${row.adjustment_type === 'lost' ? 'text-error-600' : 'text-success-600'}`}>
                    Rs. {fmt(value)}
                </span>
            ),
        },
        { key: 'reason', label: 'Reason', render: (value) => value || <span className="text-neutral-300">—</span> },
        { key: 'created_by', label: 'Recorded By', render: (value) => value || 'N/A' },
        {
            key: 'actions',
            label: 'Actions',
            width: '100px',
            render: (_value, row) => (
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
                <p className="text-neutral-500 mt-2">Only admins or superusers can view cash adjustments.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <Link to="/cash-management" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Cash Management
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Cash Adjustments</h1>
                    <p className="text-neutral-500 mt-1">Lost and found/recovered cash entries</p>
                </div>
                <Button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    icon={({ className }) => (
                        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    )}
                >
                    Record Adjustment
                </Button>
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </Button>
                    {Object.keys(filters).length > 0 && (
                        <Button variant="secondary" onClick={handleResetFilters}>Clear Filters</Button>
                    )}
                </div>
                {showFilters && (
                    <FilterBar filters={filterConfig} onApply={handleApplyFilters} onReset={handleResetFilters} />
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : adjustments.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">💵</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Cash Adjustments Recorded Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                        Record one when physical cash doesn't match what the system expects.
                    </p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={adjustments} onRowClick={handleRowClick} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}

            {/* Record Adjustment Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => { setShowModal(false); resetForm(); }}
                title="Record Cash Adjustment"
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Select
                        label="Type"
                        value={formData.adjustment_type}
                        onChange={(e) => setFormData({ ...formData, adjustment_type: e.target.value })}
                        options={[
                            { value: 'lost', label: 'Lost — reduces cash in hand' },
                            { value: 'found', label: 'Found / Recovered — increases cash in hand' },
                        ]}
                        required
                    />
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
                    <Input
                        label="Date"
                        type="date"
                        value={formData.adjustment_date}
                        onChange={(e) => setFormData({ ...formData, adjustment_date: e.target.value })}
                        required
                    />
                    <Input
                        label="Reason"
                        value={formData.reason}
                        onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                        placeholder="Optional note (e.g. till shortage, extra cash found during counting)"
                    />

                    {formData.amount && parseFloat(formData.amount) > 0 && (
                        <div className={`p-3 rounded-lg ${formData.adjustment_type === 'lost' ? 'bg-amber-50' : 'bg-green-50'}`}>
                            <p className={`text-sm ${formData.adjustment_type === 'lost' ? 'text-amber-700' : 'text-green-700'}`}>
                                {formData.adjustment_type === 'lost' ? '⚠️' : 'ℹ️'} This will {formData.adjustment_type === 'lost' ? 'deduct' : 'add'}{' '}
                                <strong>Rs. {fmt(formData.amount)}</strong> {formData.adjustment_type === 'lost' ? 'from' : 'to'} cash in hand
                            </p>
                        </div>
                    )}

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
                            Record Adjustment
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete Cash Adjustment"
                message={`Are you sure you want to delete this Rs. ${fmt(deleteConfirm?.amount)} ${deleteConfirm?.adjustment_type} entry? This will reverse its effect on cash in hand.`}
            />
        </div>
    );
};

export default CashAdjustmentsPage;
