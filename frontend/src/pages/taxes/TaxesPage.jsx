import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTaxesStats, useTaxPayments } from '../../hooks/useTaxes';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import FilterBar from '../../components/ui/FilterBar';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const StatBox = ({ label, value, tone = 'neutral', subtitle }) => {
    const tones = {
        neutral: 'text-neutral-900',
        amber: 'text-warning-700',
        red: 'text-error-600',
        blue: 'text-info-600',
        purple: 'text-purple-600',
        green: 'text-success-600',
        orange: 'text-orange-600',
    };
    return (
        <Card className="p-4">
            <p className="text-xs text-neutral-500 mb-1">{label}</p>
            <p className={`text-xl font-bold ${tones[tone]}`}>Rs. {fmt(value)}</p>
            {subtitle && <p className="text-xs text-neutral-400 mt-1">{subtitle}</p>}
        </Card>
    );
};

const TaxesPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data: stats, loading: statsLoading, refetch: refetchStats } = useTaxesStats();
    const {
        data: payments, meta, page, setPage, loading: paymentsLoading,
        filters, setFilters, refetch, create, delete: deletePayment,
    } = useTaxPayments();

    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        note: '',
    });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [showFilters, setShowFilters] = useState(false);

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
            setFormError(error.response?.data?.detail || error.response?.data?.amount?.[0] || 'Failed to record tax payment');
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

    const handleApplyFilters = (values) => setFilters(values);
    const handleResetFilters = () => setFilters({});

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
                <p className="text-neutral-500 mt-2">Only admins or superusers can view taxes.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">Taxes</h1>
                    <p className="text-neutral-500 mt-1">
                        Sales tax (GST) position and withholding tax (WHT) info — see{' '}
                        <Link to="/reports/sales-tax" className="text-primary-600 hover:text-primary-700">
                            Sales Tax Report
                        </Link>{' '}
                        for a transaction-level breakdown.
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
                    Record Tax Payment
                </Button>
            </div>

            {statsLoading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatBox label="Net Sales Tax Payable" value={stats?.net_sales_tax_payable} tone="amber" subtitle="Output minus Input tax" />
                        <StatBox label="Sales Tax Outstanding" value={stats?.sales_tax_outstanding} tone="red" subtitle="Still to pay FBR" />
                        <StatBox label="Input Tax Paid" value={stats?.total_input_tax_paid} tone="blue" subtitle="GST paid to suppliers" />
                        <StatBox label="Output Tax Collected" value={stats?.total_output_tax_collected} tone="purple" subtitle="GST charged to customers" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <StatBox label="Sales Tax Paid" value={stats?.total_sales_tax_paid} tone="green" subtitle="Actually paid to FBR so far" />
                        <StatBox label="WHT Withheld from Suppliers" value={stats?.total_wht_withheld_from_suppliers} tone="orange" subtitle="Info only — real FBR liability" />
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                        WHT Withheld by Customers: <strong>Rs. {fmt(stats?.total_wht_withheld_by_customers)}</strong> — info only,
                        money you never touch; it's a credit for your own annual return, not payable by you.
                    </div>
                </>
            )}

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-neutral-900">Tax Payments</h2>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
                            {showFilters ? 'Hide Filters' : 'Show Filters'}
                        </Button>
                        {Object.keys(filters).length > 0 && (
                            <Button variant="secondary" onClick={handleResetFilters}>Clear Filters</Button>
                        )}
                    </div>
                </div>

                {showFilters && (
                    <FilterBar filters={filterConfig} onApply={handleApplyFilters} onReset={handleResetFilters} />
                )}

                {paymentsLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : payments.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-6xl mb-4">🧾</div>
                        <h3 className="text-lg font-semibold text-neutral-900">No Tax Payments Recorded Yet</h3>
                        <p className="text-sm text-neutral-500 mt-1">
                            Record a payment when you actually pay GST to FBR.
                        </p>
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

            {/* Record Tax Payment Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => { setShowModal(false); resetForm(); }}
                title="Record Tax Payment"
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
                        placeholder="Enter amount paid to FBR"
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
                        placeholder="Optional note (e.g. filing period)"
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
                title="Delete Tax Payment"
                message={`Are you sure you want to delete this Rs. ${fmt(deleteConfirm?.amount)} tax payment? This will restore the amount to cash in hand.`}
            />
        </div>
    );
};

export default TaxesPage;
