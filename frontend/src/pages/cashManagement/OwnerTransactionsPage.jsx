import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCashManagementStats, useOwnerTransactions } from '../../hooks/useCashManagement';
import Card from '../../components/ui/Card';
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

const OwnerTransactionsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data: stats, loading: statsLoading, refetch: refetchStats } = useCashManagementStats();
    const {
        data: transactions, meta, page, setPage, loading,
        filters, setFilters, refetch, create, delete: deleteTransaction,
    } = useOwnerTransactions();

    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        transaction_type: 'contribution',
        amount: '',
        transaction_date: new Date().toISOString().split('T')[0],
        note: '',
    });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [showFilters, setShowFilters] = useState(false);

    const resetForm = () => {
        setFormData({
            transaction_type: 'contribution', amount: '',
            transaction_date: new Date().toISOString().split('T')[0], note: '',
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
            setFormError(error.response?.data?.detail || error.response?.data?.amount?.[0] || 'Failed to record owner transaction');
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (id) => {
        await deleteTransaction(id);
        setDeleteConfirm(null);
        refetch();
        refetchStats();
    };

    const handleApplyFilters = (values) => setFilters(values);
    const handleResetFilters = () => setFilters({});
    const handleRowClick = (row) => navigate(`/cash-management/owner-transactions/${row.id}`);

    const filterConfig = [
        { name: 'transaction_type', label: 'Type', type: 'select', options: [
            { value: '', label: 'All' },
            { value: 'contribution', label: 'Contribution' },
            { value: 'drawing', label: 'Drawing' },
        ] },
        { name: 'date_from', label: 'Date From', type: 'date' },
        { name: 'date_to', label: 'Date To', type: 'date' },
        { name: 'min_amount', label: 'Min Amount', type: 'number' },
        { name: 'max_amount', label: 'Max Amount', type: 'number' },
    ];

    const columns = [
        { key: 'transaction_date', label: 'Date', render: (v) => new Date(v).toLocaleDateString() },
        {
            key: 'transaction_type',
            label: 'Type',
            render: (v) => v === 'contribution'
                ? <Badge variant="success" size="sm">Contribution</Badge>
                : <Badge variant="warning" size="sm">Drawing</Badge>,
        },
        {
            key: 'amount',
            label: 'Amount (PKR)',
            render: (v, row) => (
                <span className={`font-semibold ${row.transaction_type === 'contribution' ? 'text-success-600' : 'text-warning-700'}`}>
                    Rs. {fmt(v)}
                </span>
            ),
        },
        { key: 'note', label: 'Note', render: (v) => v || <span className="text-neutral-300">—</span> },
        { key: 'created_by', label: 'Recorded By', render: (v) => v || 'N/A' },
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
                <p className="text-neutral-500 mt-2">Only admins or superusers can view owner transactions.</p>
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
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Owner Transactions</h1>
                    <p className="text-neutral-500 mt-1">
                        Money the owner deposits into or withdraws from the business — distinct from
                        investor capital and from unexplained lost/found cash.
                    </p>
                </div>
                <Button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    icon={({ className }) => (
                        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    )}
                >
                    Record Transaction
                </Button>
            </div>

            {!statsLoading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="p-4">
                        <p className="text-xs text-neutral-500 mb-1">Total Contributions</p>
                        <p className="text-xl font-bold text-info-600">Rs. {fmt(stats?.total_owner_contributions)}</p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-xs text-neutral-500 mb-1">Total Drawings</p>
                        <p className="text-xl font-bold text-warning-700">Rs. {fmt(stats?.total_owner_drawings)}</p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-xs text-neutral-500 mb-1">Number of Drawings</p>
                        <p className="text-xl font-bold text-neutral-900">{stats?.total_owner_withdrawals_count ?? 0}</p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-xs text-neutral-500 mb-1">Net Owner Capital</p>
                        <p className={`text-xl font-bold ${parseFloat(stats?.net_owner_capital) < 0 ? 'text-error-600' : 'text-purple-600'}`}>
                            Rs. {fmt(stats?.net_owner_capital)}
                        </p>
                    </Card>
                </div>
            )}

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                Drawings are not capped by contributions — the owner can draw out more than they've
                deposited (financed by the business's profits). A negative net owner capital is normal.
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
            ) : transactions.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">👤</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Owner Transactions Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                        Record a contribution or drawing to get started.
                    </p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={transactions} onRowClick={handleRowClick} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}

            {/* Record Transaction Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => { setShowModal(false); resetForm(); }}
                title="Record Owner Transaction"
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Select
                        label="Type"
                        value={formData.transaction_type}
                        onChange={(e) => setFormData({ ...formData, transaction_type: e.target.value })}
                        options={[
                            { value: 'contribution', label: 'Contribution — increases cash in hand' },
                            { value: 'drawing', label: 'Drawing — decreases cash in hand' },
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
                        value={formData.transaction_date}
                        onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                        required
                    />
                    <Input
                        label="Note"
                        value={formData.note}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        placeholder="Optional"
                    />

                    {formData.amount && parseFloat(formData.amount) > 0 && (
                        <div className={`p-3 rounded-lg ${formData.transaction_type === 'contribution' ? 'bg-green-50' : 'bg-amber-50'}`}>
                            <p className={`text-sm ${formData.transaction_type === 'contribution' ? 'text-green-700' : 'text-amber-700'}`}>
                                {formData.transaction_type === 'contribution' ? 'ℹ️' : '⚠️'} This will {formData.transaction_type === 'contribution' ? 'add' : 'deduct'}{' '}
                                <strong>Rs. {fmt(formData.amount)}</strong> {formData.transaction_type === 'contribution' ? 'to' : 'from'} cash in hand
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
                            Record
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete Owner Transaction"
                message={`Are you sure you want to delete this Rs. ${fmt(deleteConfirm?.amount)} ${deleteConfirm?.transaction_type}? This will reverse its effect on cash in hand.`}
            />
        </div>
    );
};

export default OwnerTransactionsPage;
