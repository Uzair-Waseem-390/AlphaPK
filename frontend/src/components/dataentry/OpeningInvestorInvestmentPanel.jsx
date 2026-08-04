import { useState, useEffect, useCallback } from 'react';
import { dataEntryApi, extractApiError } from '../../services/dataEntryApi';
import { cashManagementApi } from '../../services/cashManagementApi';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import SearchableSelect from '../ui/SearchableSelect';
import LoadingSpinner from '../ui/LoadingSpinner';

const fmt = (v) => Number(v || 0).toFixed(2);

const OpeningInvestorInvestmentPanel = () => {
    const [selectedInvestorLabel, setSelectedInvestorLabel] = useState('');
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ investor_id: '', amount: '', note: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const loadRecords = useCallback(async () => {
        try {
            const res = await dataEntryApi.openingInvestorInvestment.getAll({ page_size: 500 });
            setRecords(res?.results ?? res ?? []);
        } catch {
            setRecords([]);
        }
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                await loadRecords();
            } finally {
                setLoading(false);
            }
        })();
    }, [loadRecords]);

    const searchInvestors = useCallback(async (query) => {
        const res = await cashManagementApi.investors.getAll({ search: query, page_size: 25 });
        const results = res?.results ?? res ?? [];
        return results.map(i => ({ value: i.id, label: i.name }));
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setSuccess('');
        if (!form.investor_id) return setError('Please select an investor.');
        if (!form.amount || parseFloat(form.amount) <= 0) return setError('Amount must be greater than 0.');
        setSaving(true);
        try {
            await dataEntryApi.openingInvestorInvestment.create({
                investor_id: parseInt(form.investor_id),
                amount: form.amount,
                note: form.note,
            });
            setSuccess('Opening investor investment recorded.');
            setForm({ investor_id: '', amount: '', note: '' });
            setSelectedInvestorLabel('');
            await loadRecords();
        } catch (err) {
            setError(extractApiError(err, 'Failed to record investment.'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>;
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card hover={false}>
                <h3 className="font-semibold text-neutral-900 mb-4">New Opening Investor Investment</h3>
                <p className="text-sm text-neutral-500 mb-4">
                    For capital an investor put in before this system existed — added to their
                    invested stake, but <span className="font-medium">not</span> to Cash in Hand
                    (that cash isn't actually sitting in the till right now).
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <SearchableSelect
                        label="Investor"
                        value={form.investor_id}
                        selectedLabel={selectedInvestorLabel}
                        onChange={(v, option) => {
                            setForm(f => ({ ...f, investor_id: v }));
                            setSelectedInvestorLabel(option?.label ?? '');
                        }}
                        onSearch={searchInvestors}
                        placeholder="Search investor..."
                        required
                    />
                    <Input
                        label="Investment Amount (PKR)"
                        type="number" step="0.01" min="0.01"
                        value={form.amount}
                        onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="Amount already invested by this investor"
                        required
                    />
                    <Input
                        label="Note (optional)"
                        value={form.note}
                        onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                        placeholder="Reference / remarks"
                    />
                    {error && <p className="text-sm text-error-600">{error}</p>}
                    {success && <p className="text-sm text-success-600">{success}</p>}
                    <Button type="submit" loading={saving}>Record Investment</Button>
                </form>
            </Card>

            <Card hover={false}>
                <h3 className="font-semibold text-neutral-900 mb-4">Recorded ({records.length})</h3>
                {records.length === 0 ? (
                    <p className="text-sm text-neutral-500 py-4 text-center">No opening investor investments yet.</p>
                ) : (
                    <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                                    <th className="py-2 pr-3">Investor</th>
                                    <th className="py-2 pr-3 text-right">Amount</th>
                                    <th className="py-2 pr-3">Note</th>
                                    <th className="py-2">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {records.map(r => (
                                    <tr key={r.id}>
                                        <td className="py-2 pr-3">{r.investor_name}</td>
                                        <td className="py-2 pr-3 text-right font-medium">{fmt(r.amount)}</td>
                                        <td className="py-2 pr-3 text-neutral-500">{r.note}</td>
                                        <td className="py-2 text-neutral-500">{new Date(r.created_at).toLocaleDateString()}</td>
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

export default OpeningInvestorInvestmentPanel;
