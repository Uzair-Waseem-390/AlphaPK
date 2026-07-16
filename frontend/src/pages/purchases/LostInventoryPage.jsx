import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import Card from '../../components/ui/Card';
import SearchBar from '../../components/ui/SearchBar';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const formatCurrency = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const LostInventoryPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    const [cart, setCart] = useState([]);
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const previewTimer = useRef(null);

    useEffect(() => {
        if (!searchTerm) {
            setSearchResults([]);
            return;
        }
        let cancelled = false;
        setSearching(true);
        purchasesApi.inventory.getAll({ search: searchTerm, page_size: 8 })
            .then((res) => {
                if (cancelled) return;
                const items = res?.results || res || [];
                setSearchResults(items.filter((i) => (i.quantity || 0) > 0));
            })
            .catch(() => { if (!cancelled) setSearchResults([]); })
            .finally(() => { if (!cancelled) setSearching(false); });
        return () => { cancelled = true; };
    }, [searchTerm]);

    // Debounced FIFO cost preview — refreshes whenever a cart line's quantity changes.
    useEffect(() => {
        if (previewTimer.current) clearTimeout(previewTimer.current);
        previewTimer.current = setTimeout(() => {
            cart.forEach((line, index) => {
                const quantity = Number(line.quantity);
                if (!quantity || quantity <= 0) return;
                purchasesApi.lostInventory.fifoPreview(line.product_id, quantity)
                    .then((preview) => {
                        setCart((prev) => prev.map((l, i) => (
                            i === index
                                ? {
                                    ...l,
                                    unit_cost: preview.unit_cost,
                                    total_cost: preview.total_cost,
                                    available_quantity: preview.available_quantity,
                                    sufficient_stock: preview.sufficient_stock,
                                    previewLoading: false,
                                }
                                : l
                        )));
                    })
                    .catch(() => {
                        setCart((prev) => prev.map((l, i) => (
                            i === index ? { ...l, previewLoading: false } : l
                        )));
                    });
            });
        }, 400);
        return () => clearTimeout(previewTimer.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cart.map((l) => `${l.product_id}:${l.quantity}`).join(',')]);

    const handleAddProduct = (item) => {
        const productId = item.product?.id;
        if (!productId) return;
        if (cart.some((l) => l.product_id === productId)) {
            setError('This product is already in the batch.');
            return;
        }
        setError('');
        setCart((prev) => [...prev, {
            product_id: productId,
            product_name: item.product?.name,
            product_code: item.product?.code,
            available_quantity: item.quantity,
            quantity: '1',
            reason: '',
            unit_cost: 0,
            total_cost: 0,
            sufficient_stock: true,
            previewLoading: true,
        }]);
        setSearchTerm('');
        setSearchResults([]);
    };

    const handleUpdateLine = (index, field, value) => {
        setCart((prev) => prev.map((l, i) => (
            i === index
                ? { ...l, [field]: value, ...(field === 'quantity' ? { previewLoading: true } : {}) }
                : l
        )));
    };

    const handleRemoveLine = (index) => {
        setCart((prev) => prev.filter((_, i) => i !== index));
    };

    const grandTotal = cart.reduce((sum, l) => sum + (parseFloat(l.total_cost) || 0), 0);
    const hasInsufficientStock = cart.some((l) => !l.sufficient_stock);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (cart.length === 0) {
            setError('Add at least one product to the batch.');
            return;
        }
        if (cart.some((l) => !Number(l.quantity) || Number(l.quantity) <= 0)) {
            setError('Enter a valid quantity greater than zero for every item.');
            return;
        }
        if (hasInsufficientStock) {
            setError('One or more items exceed available stock. Adjust the quantity before submitting.');
            return;
        }

        setSubmitting(true);
        try {
            const result = await purchasesApi.lostInventory.create({
                items: cart.map((l) => ({
                    product_id: l.product_id,
                    quantity: Number(l.quantity),
                    reason: l.reason || '',
                })),
                note,
            });
            setSuccessMessage(`Recorded as ${result.reference_number} — total loss Rs. ${formatCurrency(result.total_lost_amount)}.`);
            setCart([]);
            setNote('');
        } catch (err) {
            const data = err.response?.data;
            if (data && typeof data === 'object') {
                const messages = Object.entries(data)
                    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                    .join('\n');
                setError(messages);
            } else {
                setError(err.message || 'Failed to record lost inventory. Please try again.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can manage lost inventory.</p>
                <Link to="/purchases/inventory" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Inventory
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-neutral-900">Manage Inventory</h1>
                <p className="text-neutral-500 mt-1">Mark lost, damaged, or missing products from inventory</p>
                <div className="mt-2 flex gap-4">
                    <Link to="/purchases/inventory" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Inventory
                    </Link>
                    <Link to="/purchases/lost-inventory/records" className="text-sm text-primary-600 hover:text-primary-700">
                        View Lost Inventory Records →
                    </Link>
                </div>
            </div>

            <Card className="p-6 space-y-4">
                <h3 className="font-semibold text-neutral-900">Search Product</h3>
                <SearchBar
                    onSearch={setSearchTerm}
                    placeholder="Search products by name or code, then press Enter..."
                />

                {searching && (
                    <div className="flex justify-center py-4">
                        <LoadingSpinner size="sm" />
                    </div>
                )}

                {!searching && searchResults.length > 0 && (
                    <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
                        {searchResults.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => handleAddProduct(item)}
                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 transition-colors text-left"
                            >
                                <div>
                                    <p className="font-medium text-neutral-900">{item.product?.name}</p>
                                    <p className="text-xs text-neutral-500">{item.product?.code}</p>
                                </div>
                                <Badge variant={item.quantity <= 5 ? 'warning' : 'success'}>
                                    In stock: {item.quantity}
                                </Badge>
                            </button>
                        ))}
                    </div>
                )}
            </Card>

            <Card className="p-6 space-y-4">
                <h3 className="font-semibold text-neutral-900">Lost Items Batch</h3>

                {cart.length === 0 ? (
                    <p className="text-center text-neutral-500 py-6">
                        Search for a product above and select it to add to this batch.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {cart.map((line, index) => (
                            <div key={line.product_id} className="grid grid-cols-1 md:grid-cols-6 gap-3 p-4 bg-neutral-50 rounded-xl items-end">
                                <div className="md:col-span-2">
                                    <p className="text-sm font-medium text-neutral-900">{line.product_name}</p>
                                    <p className="text-xs text-neutral-500">
                                        {line.product_code} — Available: {line.available_quantity}
                                    </p>
                                </div>
                                <Input
                                    label="Quantity Lost"
                                    type="number"
                                    min="1"
                                    value={line.quantity}
                                    onChange={(e) => {
                                        const raw = e.target.value;
                                        if (raw !== '' && !/^\d+$/.test(raw)) return;
                                        handleUpdateLine(index, 'quantity', raw);
                                    }}
                                />
                                <Input
                                    label="Reason (optional)"
                                    value={line.reason}
                                    onChange={(e) => handleUpdateLine(index, 'reason', e.target.value)}
                                    placeholder="Damaged, expired..."
                                />
                                <div>
                                    <p className="text-xs text-neutral-500">FIFO Cost</p>
                                    {line.previewLoading ? (
                                        <p className="text-sm text-neutral-400">Calculating...</p>
                                    ) : (
                                        <>
                                            <p className="font-semibold text-neutral-900">Rs. {formatCurrency(line.total_cost)}</p>
                                            <p className="text-xs text-neutral-500">@ Rs. {formatCurrency(line.unit_cost)}/unit</p>
                                        </>
                                    )}
                                    {!line.previewLoading && !line.sufficient_stock && (
                                        <p className="text-xs text-error-600 mt-1">Exceeds available stock</p>
                                    )}
                                </div>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => handleRemoveLine(index)}
                                >
                                    Remove
                                </Button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="pt-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                        Batch Note (optional)
                    </label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder="Overall note for this batch, e.g. warehouse audit 2026-07-16"
                        className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                    />
                </div>

                {error && (
                    <div className="p-4 bg-error-50 border border-error-200 rounded-lg">
                        <p className="text-sm text-error-600 whitespace-pre-wrap">{error}</p>
                    </div>
                )}

                {successMessage && (
                    <div className="p-4 bg-success-50 border border-success-200 rounded-lg">
                        <p className="text-sm text-success-700">{successMessage}</p>
                    </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
                    <div>
                        <p className="text-sm text-neutral-500">Total Lost Value</p>
                        <p className="text-2xl font-bold text-error-600">Rs. {formatCurrency(grandTotal)}</p>
                    </div>
                    <Button onClick={handleSubmit} loading={submitting} disabled={cart.length === 0}>
                        Record Lost Inventory
                    </Button>
                </div>
            </Card>
        </div>
    );
};

export default LostInventoryPage;
