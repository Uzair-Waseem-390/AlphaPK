import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cashManagementApi } from '../../services/cashManagementApi';
import { useInvestorTransactions } from '../../hooks/useCashManagement';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const InvestorDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [investor, setInvestor] = useState(null);
    const [loading, setLoading] = useState(true);

    const {
        data: transactions, meta, page, setPage, loading: txnLoading,
        refetch: refetchTxns, create, delete: deleteTxn,
    } = useInvestorTransactions({ investor_id: id });

    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        transaction_type: 'investment',
        amount: '',
        transaction_date: new Date().toISOString().split('T')[0],
        note: '',
    });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        fetchInvestor();
    }, [id]);

    const fetchInvestor = async () => {
        setLoading(true);
        try {
            const data = await cashManagementApi.investors.getById(id);
            setInvestor(data);
        } catch (error) {
            console.error('Failed to fetch investor:', error);
            setInvestor(null);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            transaction_type: 'investment', amount: '',
            transaction_date: new Date().toISOString().split('T')[0], note: '',
        });
        setFormError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormLoading(true);
        try {
            await create({ ...formData, investor: id, amount: parseFloat(formData.amount) });
            setShowModal(false);
            resetForm();
            await Promise.all([refetchTxns(), fetchInvestor()]);
        } catch (error) {
            setFormError(error.response?.data?.detail || error.response?.data?.amount?.[0] || 'Failed to record transaction');
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (txnId) => {
        try {
            await deleteTxn(txnId);
            setDeleteConfirm(null);
            await Promise.all([refetchTxns(), fetchInvestor()]);
        } catch (error) {
            setDeleteConfirm(null);
            alert(error.response?.data?.detail || 'Failed to delete transaction');
        }
    };

    const columns = [
        { key: 'transaction_date', label: 'Date', render: (v) => new Date(v).toLocaleDateString() },
        {
            key: 'transaction_type',
            label: 'Type',
            render: (v) => v === 'investment'
                ? <Badge variant="success" size="sm">Investment</Badge>
                : <Badge variant="warning" size="sm">Withdrawal</Badge>,
        },
        {
            key: 'amount',
            label: 'Amount (PKR)',
            render: (v, row) => (
                <span className={`font-semibold ${row.transaction_type === 'investment' ? 'text-success-600' : 'text-warning-700'}`}>
                    Rs. {fmt(v)}
                </span>
            ),
        },
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
                <p className="text-neutral-500 mt-2">Only admins or superusers can view investors.</p>
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

    if (!investor) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Investor Not Found</h2>
                <Link to="/cash-management/investors" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Investors
                </Link>
            </div>
        );
    }

    const growthIncrease = parseFloat(investor.current_worth) - parseFloat(investor.net_stake);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <Link to="/cash-management/investors" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Investors
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">{investor.name}</h1>
                    <p className="text-neutral-500">
                        {investor.contact_number || 'No contact number'}{investor.email ? ` · ${investor.email}` : ''}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="secondary"
                        onClick={() => navigate('/cash-management/growth-history', { state: { investor_id: id } })}
                    >
                        View Growth History →
                    </Button>
                    <Button
                        onClick={() => { resetForm(); setShowModal(true); }}
                        icon={({ className }) => (
                            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        )}
                    >
                        Record Investment / Withdrawal
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="p-4">
                    <p className="text-xs text-neutral-500 mb-1">Total Invested</p>
                    <p className="text-xl font-bold text-info-600">Rs. {fmt(investor.total_invested)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs text-neutral-500 mb-1">Total Withdrawn</p>
                    <p className="text-xl font-bold text-warning-700">Rs. {fmt(investor.total_withdrawn)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs text-neutral-500 mb-1">Net Stake</p>
                    <p className="text-xl font-bold text-purple-600">Rs. {fmt(investor.net_stake)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs text-neutral-500 mb-1">Growth Rate</p>
                    <p className="text-xl font-bold text-neutral-900">
                        {parseFloat(investor.growth_rate) > 0 ? `${(parseFloat(investor.growth_rate) * 100).toFixed(2)}% / yr` : '—'}
                    </p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs text-neutral-500 mb-1">Current Worth</p>
                    <p className="text-xl font-bold text-teal-600">Rs. {fmt(investor.current_worth)}</p>
                    {growthIncrease > 0 && (
                        <p className="text-xs text-success-600 mt-1">+Rs. {fmt(growthIncrease)} from growth</p>
                    )}
                </Card>
            </div>

            {parseFloat(investor.growth_rate) > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                    Current Worth is a theoretical value grown monthly at this investor's rate — it's informational
                    only. Withdrawals are always capped by Net Stake (the actual amount invested), never by Current Worth.
                </div>
            )}

            {investor.note && (
                <Card className="p-4">
                    <p className="text-sm text-neutral-500">Note</p>
                    <p className="font-medium">{investor.note}</p>
                </Card>
            )}

            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Transaction History</h2>
                {txnLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-6xl mb-4">📜</div>
                        <h3 className="text-lg font-semibold text-neutral-900">No Transactions Yet</h3>
                        <p className="text-sm text-neutral-500 mt-1">Record an investment or withdrawal to get started.</p>
                    </div>
                ) : (
                    <>
                        <Table columns={columns} data={transactions} />
                        {meta.totalPages > 1 && (
                            <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                        )}
                    </>
                )}
            </div>

            {/* Record Transaction Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => { setShowModal(false); resetForm(); }}
                title="Record Investment / Withdrawal"
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Select
                        label="Type"
                        value={formData.transaction_type}
                        onChange={(e) => setFormData({ ...formData, transaction_type: e.target.value })}
                        options={[
                            { value: 'investment', label: 'Investment — increases cash in hand' },
                            { value: 'withdrawal', label: 'Withdrawal — decreases cash in hand' },
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

                    {formData.transaction_type === 'withdrawal' && (
                        <p className="text-xs text-neutral-500">
                            Current net stake: <strong>Rs. {fmt(investor.net_stake)}</strong> — withdrawals above this are rejected.
                        </p>
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
                title="Delete Transaction"
                message={`Are you sure you want to delete this Rs. ${fmt(deleteConfirm?.amount)} ${deleteConfirm?.transaction_type}? This will reverse its effect on cash in hand and this investor's balance.`}
            />
        </div>
    );
};

export default InvestorDetailPage;
