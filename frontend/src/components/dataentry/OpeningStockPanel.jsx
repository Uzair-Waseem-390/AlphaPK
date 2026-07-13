import { useState, useEffect, useCallback } from 'react';
import { dataEntryApi, extractApiError } from '../../services/dataEntryApi';
import { purchasesApi } from '../../services/purchasesApi';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import SearchableSelect from '../ui/SearchableSelect';
import LoadingSpinner from '../ui/LoadingSpinner';

const fmt = (v) => Number(v || 0).toFixed(2);
const emptyRow = () => ({ product_id: '', quantity: '', unit_price: '', gst: '0', wht: '0', description: '' });

const OpeningStockPanel = () => {
    const [products, setProducts] = useState([]);
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [rows, setRows] = useState([emptyRow()]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const loadRecords = useCallback(async () => {
        try {
            const res = await dataEntryApi.openingStock.getAll({ page_size: 500 });
            setRecords(res?.results ?? res ?? []);
        } catch {
            setRecords([]);
        }
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const prod = await purchasesApi.products.getAll({ page_size: 500 });
                setProducts(prod?.results ?? prod ?? []);
                await loadRecords();
            } finally {
                setLoading(false);
            }
        })();
    }, [loadRecords]);

    const productOptions = products.map(p => ({ value: p.id, label: `${p.name} (${p.code})` }));

    const updateRow = (i, key, val) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
    const addRow = () => setRows(rs => [...rs, emptyRow()]);
    const removeRow = (i) => setRows(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setSuccess('');

        const seen = new Set();
        const items = [];
        for (const r of rows) {
            if (!r.product_id) return setError('Every row needs a product.');
            if (seen.has(r.product_id)) return setError('A product is listed more than once.');
            seen.add(r.product_id);
            if (!r.quantity || parseInt(r.quantity) <= 0) return setError('Quantity must be greater than 0.');
            if (!r.unit_price || parseFloat(r.unit_price) <= 0) return setError('Unit price must be greater than 0.');
            items.push({
                product_id: parseInt(r.product_id),
                quantity: parseInt(r.quantity),
                unit_price: r.unit_price,
                gst: r.gst || 0,
                wht: r.wht || 0,
                description: r.description || '',
            });
        }

        setSaving(true);
        try {
            await dataEntryApi.openingStock.create({ items });
            setSuccess('Opening stock added to inventory.');
            setRows([emptyRow()]);
            await loadRecords();
        } catch (err) {
            setError(extractApiError(err, 'Failed to add opening stock.'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>;
    }

    return (
        <div className="space-y-6">
            <Card hover={false}>
                <h3 className="font-semibold text-neutral-900 mb-4">Add Opening Stock</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {rows.map((row, i) => (
                        <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border-b border-neutral-100 pb-4">
                            <div className="md:col-span-4">
                                <SearchableSelect
                                    label={i === 0 ? 'Product' : undefined}
                                    value={row.product_id}
                                    onChange={(v) => updateRow(i, 'product_id', v)}
                                    options={productOptions}
                                    placeholder="Search product..."
                                />
                            </div>
                            <div className="md:col-span-2">
                                <Input label={i === 0 ? 'Qty' : undefined} type="number" min="1"
                                    value={row.quantity} onChange={(e) => updateRow(i, 'quantity', e.target.value)} placeholder="Qty" />
                            </div>
                            <div className="md:col-span-2">
                                <Input label={i === 0 ? 'Unit Price' : undefined} type="number" step="0.01" min="0.01"
                                    value={row.unit_price} onChange={(e) => updateRow(i, 'unit_price', e.target.value)} placeholder="Price" />
                            </div>
                            <div className="md:col-span-1">
                                <Input label={i === 0 ? 'GST%' : undefined} type="number" step="0.01" min="0"
                                    value={row.gst} onChange={(e) => updateRow(i, 'gst', e.target.value)} />
                            </div>
                            <div className="md:col-span-1">
                                <Input label={i === 0 ? 'WHT%' : undefined} type="number" step="0.01" min="0"
                                    value={row.wht} onChange={(e) => updateRow(i, 'wht', e.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                                <Button type="button" variant="secondary" size="sm" className="w-full"
                                    onClick={() => removeRow(i)} disabled={rows.length === 1}>
                                    Remove
                                </Button>
                            </div>
                        </div>
                    ))}

                    <div className="flex items-center gap-3">
                        <Button type="button" variant="outline" size="sm" onClick={addRow}>+ Add Product</Button>
                    </div>

                    <div className="p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-700">
                            ℹ️ Adds quantities to inventory (FIFO-ready). No cash or supplier-payable effect.
                        </p>
                    </div>
                    {error && <p className="text-sm text-error-600">{error}</p>}
                    {success && <p className="text-sm text-success-600">{success}</p>}
                    <Button type="submit" loading={saving}>Add Opening Stock</Button>
                </form>
            </Card>

            <Card hover={false}>
                <h3 className="font-semibold text-neutral-900 mb-4">Recorded Stock Entries ({records.length})</h3>
                {records.length === 0 ? (
                    <p className="text-sm text-neutral-500 py-4 text-center">No opening stock entries yet.</p>
                ) : (
                    <div className="space-y-4">
                        {records.map(order => (
                            <div key={order.id} className="border border-neutral-200 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium text-neutral-900">{order.order_number}</span>
                                    <span className="text-xs text-neutral-500">{new Date(order.created_at).toLocaleString()}</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs text-neutral-500 border-b border-neutral-100">
                                                <th className="py-1 pr-3">Product</th>
                                                <th className="py-1 pr-3 text-right">Qty</th>
                                                <th className="py-1 pr-3 text-right">Unit Price</th>
                                                <th className="py-1 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-50">
                                            {(order.items || []).map((it, idx) => (
                                                <tr key={idx}>
                                                    <td className="py-1 pr-3">{it.product_name}</td>
                                                    <td className="py-1 pr-3 text-right">{it.quantity}</td>
                                                    <td className="py-1 pr-3 text-right">{fmt(it.unit_price)}</td>
                                                    <td className="py-1 text-right">{fmt(it.total_price)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
};

export default OpeningStockPanel;
