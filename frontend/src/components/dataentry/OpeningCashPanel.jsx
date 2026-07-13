import { useState, useEffect, useCallback } from 'react';
import { dataEntryApi, extractApiError } from '../../services/dataEntryApi';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import LoadingSpinner from '../ui/LoadingSpinner';

const fmt = (v) => Number(v || 0).toFixed(2);

const OpeningCashPanel = () => {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [amount, setAmount] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const loadRecords = useCallback(async () => {
        try {
            const res = await dataEntryApi.openingCash.getAll({ page_size: 500 });
            setRecords(res?.results ?? res ?? []);
        } catch {
            setRecords([]);
        }
    }, []);

    useEffect(() => {
        (async () => { setLoading(true); await loadRecords(); setLoading(false); })();
    }, [loadRecords]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setSuccess('');
        if (!amount || parseFloat(amount) <= 0) return setError('Amount must be greater than 0.');
        setSaving(true);
        try {
            await dataEntryApi.openingCash.create({ amount });
            setSuccess('Opening cash added to cash in hand.');
            setAmount('');
            await loadRecords();
        } catch (err) {
            setError(extractApiError(err, 'Failed to add opening cash.'));
        } finally {
            setSaving(false);
        }
    };

    const total = records.reduce((sum, r) => sum + Number(r.amount || 0), 0);

    if (loading) {
        return <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>;
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card hover={false}>
                <h3 className="font-semibold text-neutral-900 mb-4">Add Opening Cash</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Amount (PKR)"
                        type="number" step="0.01" min="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Cash to add to cash in hand"
                        required
                    />
                    <div className="p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-700">
                            ℹ️ Adds directly to cash in hand. Can be used multiple times.
                        </p>
                    </div>
                    {error && <p className="text-sm text-error-600">{error}</p>}
                    {success && <p className="text-sm text-success-600">{success}</p>}
                    <Button type="submit" loading={saving}>Add Opening Cash</Button>
                </form>
            </Card>

            <Card hover={false}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-neutral-900">Recorded ({records.length})</h3>
                    <span className="text-sm text-neutral-500">Total: <span className="font-semibold text-neutral-900">PKR {fmt(total)}</span></span>
                </div>
                {records.length === 0 ? (
                    <p className="text-sm text-neutral-500 py-4 text-center">No opening cash entries yet.</p>
                ) : (
                    <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                                    <th className="py-2 pr-3 text-right">Amount</th>
                                    <th className="py-2 pr-3">Added By</th>
                                    <th className="py-2">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {records.map(r => (
                                    <tr key={r.id}>
                                        <td className="py-2 pr-3 text-right font-medium">{fmt(r.amount)}</td>
                                        <td className="py-2 pr-3 text-neutral-500">{r.added_by || '—'}</td>
                                        <td className="py-2 text-neutral-500">{new Date(r.added_at).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default OpeningCashPanel;
