import { useState, useEffect, useCallback } from 'react';
import { dataEntryApi, extractApiError } from '../../services/dataEntryApi';
import { purchasesApi } from '../../services/purchasesApi';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import SearchableSelect from '../ui/SearchableSelect';
import LoadingSpinner from '../ui/LoadingSpinner';

const fmt = (v) => Number(v || 0).toFixed(2);

const SupplierOpeningBalancePanel = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ supplier_id: '', amount: '', note: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const loadRecords = useCallback(async () => {
        try {
            const res = await dataEntryApi.supplierOpeningBalance.getAll({ page_size: 500 });
            setRecords(res?.results ?? res ?? []);
        } catch {
            setRecords([]);
        }
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const sup = await purchasesApi.suppliers.getAll({ page_size: 500 });
                setSuppliers(sup?.results ?? sup ?? []);
                await loadRecords();
            } finally {
                setLoading(false);
            }
        })();
    }, [loadRecords]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setSuccess('');
        if (!form.supplier_id) return setError('Please select a supplier.');
        if (!form.amount || parseFloat(form.amount) <= 0) return setError('Amount must be greater than 0.');
        setSaving(true);
        try {
            await dataEntryApi.supplierOpeningBalance.create({
                supplier_id: parseInt(form.supplier_id),
                amount: form.amount,
                note: form.note,
            });
            setSuccess('Supplier opening balance recorded.');
            setForm({ supplier_id: '', amount: '', note: '' });
            await loadRecords();
        } catch (err) {
            setError(extractApiError(err, 'Failed to record opening balance.'));
        } finally {
            setSaving(false);
        }
    };

    // Suppliers that already have an opening balance can't get another.
    const usedSupplierIds = new Set(records.map(r => r.supplier));
    const supplierOptions = suppliers
        .filter(s => !usedSupplierIds.has(s.id))
        .map(s => ({ value: s.id, label: `${s.name} (${s.code})` }));

    if (loading) {
        return <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>;
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card hover={false}>
                <h3 className="font-semibold text-neutral-900 mb-4">New Supplier Opening Balance</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <SearchableSelect
                        label="Supplier"
                        value={form.supplier_id}
                        onChange={(v) => setForm(f => ({ ...f, supplier_id: v }))}
                        options={supplierOptions}
                        placeholder="Search supplier..."
                        required
                    />
                    <Input
                        label="Opening Balance Amount (PKR)"
                        type="number" step="0.01" min="0.01"
                        value={form.amount}
                        onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="Amount we owe this supplier"
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
                    <p className="text-sm text-neutral-500 py-4 text-center">No supplier opening balances yet.</p>
                ) : (
                    <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                                    <th className="py-2 pr-3">Supplier</th>
                                    <th className="py-2 pr-3 text-right">Amount</th>
                                    <th className="py-2 pr-3">Order</th>
                                    <th className="py-2">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {records.map(r => (
                                    <tr key={r.id}>
                                        <td className="py-2 pr-3">{r.supplier_name} <span className="text-neutral-400">({r.supplier_code})</span></td>
                                        <td className="py-2 pr-3 text-right font-medium">{fmt(r.amount)}</td>
                                        <td className="py-2 pr-3 text-neutral-500">{r.order_number}</td>
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

export default SupplierOpeningBalancePanel;
