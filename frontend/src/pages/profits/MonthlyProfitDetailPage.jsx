import { useState, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMonthlyProfitDetail, useCurrentMonthProfit } from '../../hooks/useProfits';
import { profitsApi } from '../../services/profitsApi';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const formatMonthLabel = (period) => {
    if (!period) return '';
    const [year, m] = period.split('-');
    const date = new Date(Number(year), Number(m) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const statusBadge = (status) => {
    if (status === 'paid') return <Badge variant="success" size="sm">Paid</Badge>;
    if (status === 'partial') return <Badge variant="warning" size="sm">Partial</Badge>;
    return <Badge variant="error" size="sm">Unpaid</Badge>;
};

const DeductionRow = ({ label, value, hint }) => (
    <div className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
        <div>
            <p className="text-sm text-neutral-700">{label}</p>
            {hint && <p className="text-xs text-neutral-400">{hint}</p>}
        </div>
        <p className="text-sm font-medium text-error-600">− Rs. {fmt(value)}</p>
    </div>
);

const MonthlyProfitDetailPage = () => {
    const { period } = useParams();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
    const isCurrent = period === 'current';

    // Both hooks are always called (rules-of-hooks safe across navigation
    // between a finalized month and "current" without remounting) — only
    // the relevant one's result is actually used below.
    const {
        data: finalizedData, loading: finalizedLoading, error: finalizedError, refetch: refetchFinalized,
    } = useMonthlyProfitDetail(isCurrent ? null : period);
    const {
        data: currentData, loading: currentLoading, error: currentError, refetch: refetchCurrent,
    } = useCurrentMonthProfit();

    const mp      = isCurrent ? currentData : finalizedData;
    const loading = isCurrent ? currentLoading : finalizedLoading;
    const error   = isCurrent ? currentError : finalizedError;
    const refetch = isCurrent ? refetchCurrent : refetchFinalized;

    const [settleShare, setSettleShare] = useState(null);
    const [formData, setFormData] = useState({
        amount: '', action_type: 'payout', payout_date: new Date().toISOString().split('T')[0], note: '',
    });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [deleteError, setDeleteError] = useState('');

    const resetForm = () => {
        setFormData({ amount: '', action_type: 'payout', payout_date: new Date().toISOString().split('T')[0], note: '' });
        setFormError('');
    };

    const openSettle = (share) => {
        resetForm();
        setSettleShare(share);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormLoading(true);
        try {
            await profitsApi.payouts.create(settleShare.id, {
                ...formData,
                amount: parseFloat(formData.amount),
            });
            setSettleShare(null);
            resetForm();
            refetch();
        } catch (err) {
            setFormError(
                err.response?.data?.amount?.[0] ||
                err.response?.data?.detail ||
                err.response?.data?.action_type?.[0] ||
                'Failed to record settlement'
            );
        } finally {
            setFormLoading(false);
        }
    };

    const handleDeletePayout = async (payoutId) => {
        setDeleteError('');
        try {
            await profitsApi.payouts.delete(payoutId);
            setDeleteConfirm(null);
            refetch();
        } catch (err) {
            setDeleteConfirm(null);
            setDeleteError(err.response?.data?.detail || 'Failed to reverse this settlement');
        }
    };

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view monthly profits.</p>
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

    if (error || !mp) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Month Not Found</h2>
                <Link to="/monthly-profits" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Monthly Profits
                </Link>
            </div>
        );
    }

    const netProfitPositive = parseFloat(mp.net_profit) >= 0;

    return (
        <div className="space-y-6">
            <div>
                <Link to="/monthly-profits" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Monthly Profits
                </Link>
                <div className="flex items-center gap-3 mt-1">
                    <h1 className="text-3xl font-bold text-neutral-900">{formatMonthLabel(mp.period)}</h1>
                    {isCurrent && (
                        <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            In progress — provisional
                        </span>
                    )}
                </div>
                <p className={`text-lg font-semibold mt-1 ${netProfitPositive ? 'text-success-600' : 'text-error-600'}`}>
                    Net Profit: Rs. {fmt(mp.net_profit)}
                </p>
                {isCurrent && (
                    <p className="text-sm text-neutral-500 mt-1">
                        Still accumulating — figures will keep changing until the month ends and finalizes.
                    </p>
                )}
            </div>

            {deleteError && (
                <div className="p-3 bg-error-50 border border-error-200 rounded-lg">
                    <p className="text-sm text-error-600">{deleteError}</p>
                </div>
            )}

            {/* Breakdown */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-4">How This Was Calculated</h3>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <p className="text-xs text-neutral-500">Gross Revenue</p>
                        <p className="font-semibold text-neutral-900">Rs. {fmt(mp.gross_revenue)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-neutral-500">Gross COGS</p>
                        <p className="font-semibold text-neutral-900">Rs. {fmt(mp.gross_cogs)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-neutral-500">Gross Profit</p>
                        <p className="font-semibold text-neutral-900">Rs. {fmt(mp.gross_profit)}</p>
                    </div>
                </div>

                <div className="p-3 bg-neutral-50 rounded-lg flex items-center justify-between mb-4">
                    <p className="text-sm text-neutral-600">Net Gross Profit (after returns accepted this month)</p>
                    <p className="font-semibold text-neutral-900">Rs. {fmt(mp.net_gross_profit)}</p>
                </div>

                <div className="space-y-0">
                    <DeductionRow label="Expenses Paid" value={mp.expenses_paid} />
                    <DeductionRow label="Recurring Expenses Paid" value={mp.recurring_expenses_paid} hint="Rent, salaries, utilities, etc." />
                    <DeductionRow label="GST Paid" value={mp.gst_paid} />
                    <DeductionRow label="WHT Paid" value={mp.wht_paid} />
                    <DeductionRow label="Lost Inventory (net)" value={mp.lost_inventory_net} />
                    <DeductionRow label="Lost Cash (net)" value={mp.lost_cash_net} />
                    <DeductionRow label="Depreciation" value={mp.depreciation} />
                    <div className="flex items-center justify-between py-2">
                        <p className="text-sm text-neutral-700">Disposal Gain / Loss</p>
                        <p className={`text-sm font-medium ${parseFloat(mp.disposal_gain_loss) >= 0 ? 'text-success-600' : 'text-error-600'}`}>
                            {parseFloat(mp.disposal_gain_loss) >= 0 ? '+' : '−'} Rs. {fmt(Math.abs(parseFloat(mp.disposal_gain_loss)))}
                        </p>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t-2 border-neutral-200 flex items-center justify-between">
                    <p className="font-semibold text-neutral-900">Net Profit</p>
                    <p className={`text-xl font-bold ${netProfitPositive ? 'text-success-600' : 'text-error-600'}`}>
                        Rs. {fmt(mp.net_profit)}
                    </p>
                </div>
            </Card>

            {/* Ownership split — a live PREVIEW for the current month (today's
                ownership % applied to the still-moving net profit — no settle
                actions, since nothing here is final yet); a real, frozen
                snapshot with settle actions for finalized months. */}
            {isCurrent ? (
                <Card className="p-6 border-2 border-dashed border-amber-300 bg-amber-50/40">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-neutral-900">Ownership Split — Preview</h3>
                        <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            Informational only
                        </span>
                    </div>
                    <p className="text-sm text-amber-700 mb-4">
                        Today's ownership % applied to this month's still-moving net profit — nothing here is
                        final, and no settlement can be recorded until the month finalizes.
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-neutral-500 border-b border-amber-200">
                                    <th className="pb-2 font-medium">Investor</th>
                                    <th className="pb-2 font-medium">Share %</th>
                                    <th className="pb-2 font-medium">Share Amount (preview)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {mp.investors_preview.map((inv) => (
                                    <tr key={inv.id} className="border-b border-amber-100">
                                        <td className="py-2 text-neutral-900">{inv.name}</td>
                                        <td className="py-2 text-neutral-700">{fmt(inv.share_percent)}%</td>
                                        <td className="py-2 text-neutral-700">Rs. {fmt(inv.share_amount)}</td>
                                    </tr>
                                ))}
                                <tr>
                                    <td className="py-2 font-semibold text-neutral-900">Owner</td>
                                    <td className="py-2 font-semibold text-neutral-900">{fmt(mp.owner_share_percent)}%</td>
                                    <td className="py-2 font-semibold text-neutral-900">Rs. {fmt(mp.owner_share_amount_preview)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Card>
            ) : (
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-4">Ownership Split</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-neutral-500 border-b border-neutral-200">
                                <th className="pb-2 font-medium">Investor</th>
                                <th className="pb-2 font-medium">Share %</th>
                                <th className="pb-2 font-medium">Share Amount</th>
                                <th className="pb-2 font-medium">Settled</th>
                                <th className="pb-2 font-medium">Remaining</th>
                                <th className="pb-2 font-medium">Status</th>
                                <th className="pb-2 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {mp.investor_shares.map((share) => (
                                <Fragment key={share.id}>
                                    <tr className="border-b border-neutral-100">
                                        <td className="py-2 text-neutral-900">{share.investor_name_snapshot}</td>
                                        <td className="py-2 text-neutral-700">{fmt(share.share_percent_snapshot)}%</td>
                                        <td className="py-2 text-neutral-700">Rs. {fmt(share.share_amount)}</td>
                                        <td className="py-2 text-neutral-700">Rs. {fmt(share.amount_settled)}</td>
                                        <td className="py-2 text-neutral-700">Rs. {fmt(share.amount_remaining)}</td>
                                        <td className="py-2">{statusBadge(share.payment_status)}</td>
                                        <td className="py-2 text-right">
                                            {parseFloat(share.amount_remaining) > 0 && (
                                                <Button size="sm" variant="secondary" onClick={() => openSettle(share)}>
                                                    Settle Share
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                    {share.payouts.length > 0 && (
                                        <tr>
                                            <td colSpan={7} className="pb-3">
                                                <div className="ml-2 space-y-1">
                                                    {share.payouts.map((p) => (
                                                        <div key={p.id} className="flex items-center justify-between text-xs bg-neutral-50 rounded-lg px-3 py-2">
                                                            <span className="text-neutral-600">
                                                                {p.action_type === 'reinvest' ? 'Reinvested' : 'Paid out'}{' '}
                                                                <strong>Rs. {fmt(p.amount)}</strong> on {new Date(p.payout_date).toLocaleDateString()}
                                                                {p.note && ` — ${p.note}`}
                                                            </span>
                                                            <button
                                                                onClick={() => setDeleteConfirm(p)}
                                                                className="text-error-600 hover:text-error-700"
                                                            >
                                                                Reverse
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                            <tr>
                                <td className="py-2 font-semibold text-neutral-900">Owner</td>
                                <td className="py-2 font-semibold text-neutral-900">{fmt(mp.owner_share_percent)}%</td>
                                <td className="py-2 font-semibold text-neutral-900" colSpan={4}>Rs. {fmt(mp.owner_share_amount)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-neutral-400 mt-4">
                    Share % is frozen as of this month — it won't change even if ownership % changes later.
                    An unpaid or partial balance isn't a business liability, it's informational tracking only.
                </p>
            </Card>
            )}

            {/* Settle modal */}
            <Modal
                isOpen={!!settleShare}
                onClose={() => { setSettleShare(null); resetForm(); }}
                title={`Settle Share — ${settleShare?.investor_name_snapshot ?? ''}`}
                size="lg"
            >
                {settleShare && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="p-3 bg-neutral-50 rounded-lg text-sm text-neutral-600">
                            Share amount: <strong>Rs. {fmt(settleShare.share_amount)}</strong> · Remaining: <strong>Rs. {fmt(settleShare.amount_remaining)}</strong>
                        </div>

                        <Input
                            label="Amount (PKR)"
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={settleShare.amount_remaining}
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            required
                        />

                        <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Action</label>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, action_type: 'payout' })}
                                    className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${formData.action_type === 'payout' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-neutral-200 text-neutral-600'}`}
                                >
                                    Pay Out
                                    <p className="text-xs font-normal mt-0.5 opacity-75">Cash leaves the business</p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, action_type: 'reinvest' })}
                                    className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${formData.action_type === 'reinvest' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-neutral-200 text-neutral-600'}`}
                                >
                                    Reinvest
                                    <p className="text-xs font-normal mt-0.5 opacity-75">Cash out, then back in as new investment</p>
                                </button>
                            </div>
                        </div>

                        <Input
                            label="Date"
                            type="date"
                            value={formData.payout_date}
                            onChange={(e) => setFormData({ ...formData, payout_date: e.target.value })}
                            required
                        />
                        <Input
                            label="Note"
                            value={formData.note}
                            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                            placeholder="Optional"
                        />

                        {formData.amount && parseFloat(formData.amount) > 0 && (
                            <div className="p-3 bg-amber-50 rounded-lg">
                                <p className="text-sm text-amber-700">
                                    {formData.action_type === 'reinvest'
                                        ? `⚠️ Rs. ${fmt(formData.amount)} will leave cash in hand, then immediately come back in as a new investment for ${settleShare.investor_name_snapshot} — net cash effect is zero, but both are recorded.`
                                        : `⚠️ This will deduct Rs. ${fmt(formData.amount)} from cash in hand, paid to ${settleShare.investor_name_snapshot}.`}
                                </p>
                            </div>
                        )}

                        {formError && (
                            <div className="p-3 bg-error-50 border border-error-200 rounded-lg">
                                <p className="text-sm text-error-600">{formError}</p>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="secondary" onClick={() => { setSettleShare(null); resetForm(); }}>
                                Cancel
                            </Button>
                            <Button type="submit" loading={formLoading}>
                                {formData.action_type === 'reinvest' ? 'Reinvest' : 'Pay Out'}
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDeletePayout(deleteConfirm?.id)}
                title="Reverse Settlement"
                message={`Are you sure you want to reverse this Rs. ${fmt(deleteConfirm?.amount)} ${deleteConfirm?.action_type === 'reinvest' ? 'reinvestment' : 'payout'}? This restores cash in hand${deleteConfirm?.action_type === 'reinvest' ? ' and undoes the linked investment' : ''}.`}
            />
        </div>
    );
};

export default MonthlyProfitDetailPage;
