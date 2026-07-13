import { useState, useEffect, useCallback } from 'react';
import { dataEntryApi, extractApiError } from '../../services/dataEntryApi';
import { billingApi } from '../../services/billingApi';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import SearchableSelect from '../ui/SearchableSelect';
import LoadingSpinner from '../ui/LoadingSpinner';

const fmt = (v) => Number(v || 0).toFixed(2);

const CustomerOpeningBalancePanel = () => {
    const [customers, setCustomers] = useState([]);
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ customer_id: '', amount: '', note: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const loadRecords = useCallback(async () => {
        try {
            const res = await dataEntryApi.customerOpeningBalance.getAll({ page_size: 500 });
            setRecords(res?.results ?? res ?? []);
        } catch {
            setRecords([]);
        }
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const cus = await billingApi.customers.getAll({ page_size: 500 });
                setCustomers(cus?.results ?? cus ?? []);
                await loadRecords();
            } finally {
                setLoading(false);
            }
        })();
    }, [loadRecords]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setSuccess('');
        if (!form.customer_id) return setError('Please select a customer.');
        if (!form.amount || parseFloat(form.amount) <= 0) return setError('Amount must be greater than 0.');
        setSaving(true);
        try {
            await dataEntryApi.customerOpeningBalance.create({
                customer_id: parseInt(form.customer_id),
                amount: form.amount,
                note: form.note,
            });
            setSuccess('Customer opening balance recorded.');
            setForm({ customer_id: '', amount: '', note: '' });
            await loadRecords();
        } catch (err) {
            setError(extractApiError(err, 'Failed to record opening balance.'));
        } finally {
            setSaving(false);
        }
    };

    const usedCustomerIds = new Set(records.map(r => r.customer));
    const customerOptions = customers
        .filter(c => !usedCustomerIds.has(c.id))
        .map(c => ({ value: c.id, label: `${c.name} (${c.code})` }));

    if (loading) {
        return <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>;
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card hover={false}>
                <h3 className="font-semibold text-neutral-900 mb-4">New Customer Opening Balance</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <SearchableSelect
                        label="Customer"
                        value={form.customer_id}
                        onChange={(v) => setForm(f => ({ ...f, customer_id: v }))}
                        options={customerOptions}
                        placeholder="Search customer..."
                        required
                    />
                    <Input
                        label="Opening Balance Amount (PKR)"
                        type="number" step="0.01" min="0.01"
                        value={form.amount}
                        onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="Amount this customer owes us"
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
                    <Button type="submit" loading={saving}>Record Opening Balance</Button>
                </form>
            </Card>

            <Card hover={false}>
                <h3 className="font-semibold text-neutral-900 mb-4">Recorded ({records.length})</h3>
                {records.length === 0 ? (
                    <p className="text-sm text-neutral-500 py-4 text-center">No customer opening balances yet.</p>
                ) : (
                    <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                                    <th className="py-2 pr-3">Customer</th>
                                    <th className="py-2 pr-3 text-right">Amount</th>
                                    <th className="py-2 pr-3">Invoice</th>
                                    <th className="py-2">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {records.map(r => (
                                    <tr key={r.id}>
                                        <td className="py-2 pr-3">{r.customer_name} <span className="text-neutral-400">({r.customer_code})</span></td>
                                        <td className="py-2 pr-3 text-right font-medium">{fmt(r.amount)}</td>
                                        <td className="py-2 pr-3 text-neutral-500">{r.bill_number}</td>
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

export default CustomerOpeningBalancePanel;
