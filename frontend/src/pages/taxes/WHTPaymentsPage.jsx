import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTaxesStats, useWHTPayments } from '../../hooks/useTaxes';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import SearchBar from '../../components/ui/SearchBar';
import FilterBar from '../../components/ui/FilterBar';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const WHTPaymentsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const {
        data: payments, meta, page, setPage, loading,
        filters, setFilters, refetch, create, delete: deletePayment,
    } = useWHTPayments();
    const { refetch: refetchStats } = useTaxesStats();

    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        note: '',
    });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [filterValues, setFilterValues] = useState({});

    const resetForm = () => {
        setFormData({ amount: '', payment_date: new Date().toISOString().split('T')[0], note: '' });
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
            setFormError(error.response?.data?.detail || error.response?.data?.amount?.[0] || 'Failed to record WHT payment');
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (id) => {
        await deletePayment(id);
        setDeleteConfirm(null);
        refetch();
        refetchStats();
    };

    const handleApplyFilters = (values) => {
        setFilterValues(values);
        setFilters({ ...values, search: searchTerm });
    };

    const handleResetFilters = () => {
        setFilterValues({});
        setSearchTerm('');
        setFilters({});
    };

    const handleSearch = (value) => {
        setSearchTerm(value);
        setFilters({ ...filters, search: value });
    };

    const handleRowClick = (payment) => {
        navigate(`/taxes/wht-payments/${payment.id}`);
    };

    const filterConfig = [
        { name: 'date_from', label: 'Date From', type: 'date' },
        { name: 'date_to', label: 'Date To', type: 'date' },
        { name: 'min_amount', label: 'Min Amount', type: 'number' },
        { name: 'max_amount', label: 'Max Amount', type: 'number' },
    ];

    const columns = [
        {
            key: 'payment_date',
            label: 'Date',
            render: (value) => new Date(value).toLocaleDateString(),
        },
        {
            key: 'amount',
            label: 'Amount (PKR)',
            render: (value) => <span className="font-semibold text-error-600">Rs. {fmt(value)}</span>,
        },
        { key: 'note', label: 'Note', render: (value) => value || <span className="text-neutral-300">—</span> },
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
                <p className="text-neutral-500 mt-2">Only admins or superusers can view WHT payments.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <Link to="/taxes" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Taxes
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">WHT Payments</h1>
                    <p className="text-neutral-500 mt-1">
                        Every withholding tax deposit made to FBR, against tax withheld from suppliers.
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
                    Record WHT Payment
                </Button>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                Only tax withheld from suppliers is paid here — WHT withheld by customers is deposited by
                them directly with FBR on your behalf, so it's never something you pay.
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <SearchBar
                        onSearch={handleSearch}
                        placeholder="Search by note..."
                        className="flex-1"
                        value={searchTerm}
                    />
                    <Button
                        variant="secondary"
                        onClick={() => setShowFilters(!showFilters)}
                        icon={({ className }) => (
                            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                        )}
                    >
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </Button>
                    {(Object.keys(filterValues).length > 0 || searchTerm) && (
                        <Button variant="secondary" onClick={handleResetFilters}>
                            Clear All
                        </Button>
                    )}
                </div>

                {showFilters && (
                    <FilterBar
                        filters={filterConfig}
                        onApply={handleApplyFilters}
                        onReset={handleResetFilters}
                    />
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : payments.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">🧾</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No WHT Payments Recorded Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                        Record a payment when you actually deposit WHT to FBR.
                    </p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={payments} onRowClick={handleRowClick} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}

            {/* Record WHT Payment Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => { setShowModal(false); resetForm(); }}
                title="Record WHT Payment"
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Amount (PKR)"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        placeholder="Enter amount deposited to FBR"
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
                        placeholder="Optional note (e.g. filing period, supplier)"
                    />

                    {formData.amount && parseFloat(formData.amount) > 0 && (
                        <div className="p-3 bg-amber-50 rounded-lg">
                            <p className="text-sm text-amber-700">
                                ⚠️ This will deduct <strong>Rs. {fmt(formData.amount)}</strong> from cash in hand
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
                            Record Payment
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete WHT Payment"
                message={`Are you sure you want to delete this Rs. ${fmt(deleteConfirm?.amount)} WHT payment? This will restore the amount to cash in hand.`}
            />
        </div>
    );
};

export default WHTPaymentsPage;
