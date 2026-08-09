import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { billingApi } from '../../services/billingApi';
import { purchasesApi } from '../../services/purchasesApi';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import InvoiceStatusBadge from '../../components/billing/InvoiceStatusBadge';
import PaymentStatusBadge from '../../components/billing/PaymentStatusBadge';
import ShelfAllocationEditor from '../../components/shared/ShelfAllocationEditor';

// Pulls the clearest human-readable message out of a DRF error response.
// Shelf-allocation errors come back keyed by "shelf_allocations" (a string),
// not "detail" — so a plain `error.response?.data?.detail` lookup would miss
// them and fall through to a generic message.
const extractErrorMessage = (error, fallback) => {
    const data = error?.response?.data;
    if (!data) return fallback;
    if (typeof data === 'string') return data;
    if (data.detail) return Array.isArray(data.detail) ? data.detail[0] : data.detail;
    if (data.shelf_allocations) {
        return Array.isArray(data.shelf_allocations) ? data.shelf_allocations[0] : data.shelf_allocations;
    }
    const firstKey = Object.keys(data)[0];
    if (firstKey) {
        const val = data[firstKey];
        return Array.isArray(val) ? val[0] : val;
    }
    return fallback;
};

const ReturnDetailPage = () => {
    const { returnId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [returnItem, setReturnItem] = useState(null);
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);
    // Per return-item shelf allocation UI state, keyed by return item id:
    // { allocations: [{shelf_id, quantity}], saving: bool, error: string }
    const [shelfState, setShelfState] = useState({});

    useEffect(() => {
        fetchReturnDetails();
    }, [returnId]);

    const fetchReturnDetails = async () => {
        setLoading(true);
        try {
            // Get all returns to find the specific one
            const returnsRes = await billingApi.returns.getAll({ page_size: 500 });
            const allReturns = returnsRes?.results ?? returnsRes ?? [];
            const foundReturn = allReturns.find(r => r.id === parseInt(returnId));

            if (foundReturn) {
                setReturnItem(foundReturn);

                // Fetch the full related invoice
                try {
                    const invoiceData = await billingApi.invoices.getById(foundReturn.invoice);
                    setInvoice(invoiceData);
                } catch (invoiceError) {
                    console.error('Failed to fetch related invoice:', invoiceError);
                    setInvoice(null);
                }

                // Pending returns need the shelf-allocation editor — put-away
                // is valid to any active shelf, so it searches the full shelf
                // list on demand (a large factory can have hundreds of
                // shelves, so this is a live backend search, not a preloaded
                // dropdown), seeded from whatever allocations are already saved.
                if (foundReturn.status === 'pending' && foundReturn.items?.length) {
                    setShelfState((prev) => {
                        const next = {};
                        foundReturn.items.forEach((item) => {
                            next[item.id] = {
                                allocations: (item.shelf_allocations || []).map((a) => ({
                                    shelf_id: a.shelf_id,
                                    quantity: a.quantity,
                                    shelf_name: a.shelf_name,
                                })),
                                saving: false,
                                error: prev[item.id]?.error || '',
                            };
                        });
                        return next;
                    });
                } else {
                    setShelfState({});
                }
            } else {
                setReturnItem(null);
                setInvoice(null);
            }
        } catch (error) {
            console.error('Failed to fetch return details:', error);
            setReturnItem(null);
            setInvoice(null);
        } finally {
            setLoading(false);
        }
    };

    const searchShelvesForPutAway = async (query) => {
        const res = await purchasesApi.shelves.getAll({ search: query, page_size: 25 });
        const results = res?.results ?? res ?? [];
        return results.map((s) => ({ value: s.id, label: s.name, name: s.name }));
    };

    const handleAllocationChange = (itemId, nextAllocations) => {
        setShelfState((prev) => ({
            ...prev,
            [itemId]: { ...prev[itemId], allocations: nextAllocations },
        }));
    };

    const handleSaveAllocations = async (itemId) => {
        setShelfState((prev) => ({
            ...prev,
            [itemId]: { ...prev[itemId], saving: true, error: '' },
        }));
        try {
            const allocations = (shelfState[itemId]?.allocations || [])
                .filter((a) => a.shelf_id !== '' && a.quantity !== '')
                .map((a) => ({ shelf_id: parseInt(a.shelf_id, 10), quantity: parseInt(a.quantity, 10) }));
            await billingApi.returnItems.setShelfAllocations(itemId, allocations);
            await fetchReturnDetails();
        } catch (error) {
            console.error('Failed to save shelf allocations:', error);
            const message = extractErrorMessage(error, 'Failed to save shelf allocations.');
            setShelfState((prev) => ({
                ...prev,
                [itemId]: { ...prev[itemId], saving: false, error: message },
            }));
        }
    };

    const handleAcceptReturn = async () => {
        if (!window.confirm('Are you sure you want to accept this return?')) return;
        try {
            await billingApi.returns.accept(returnId);
            // Refresh the return details
            await fetchReturnDetails();
            alert('Return accepted successfully!');
        } catch (error) {
            console.error('Failed to accept return:', error);
            alert(extractErrorMessage(error, 'Failed to accept return.'));
        }
    };

    const getStatusBadge = (status) => {
        const variants = {
            pending: 'pending',
            accepted: 'accepted',
        };
        return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!returnItem) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Return Not Found</h2>
                <p className="text-neutral-500 mt-1">The return you're looking for doesn't exist.</p>
                <Link to="/billing/returns" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Returns
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link to="/billing/returns" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Returns
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Return Details</h1>
                    <div className="flex items-center gap-3 mt-1">
                        <p className="text-neutral-500">{returnItem.reference_number}</p>
                        {getStatusBadge(returnItem.status)}
                    </div>
                </div>
                <div className="flex gap-2">
                    {returnItem.status === 'pending' && isAdmin && (
                        <Button variant="success" onClick={handleAcceptReturn}>
                            Accept Return
                        </Button>
                    )}
                    <Link to="/billing/returns">
                        <Button variant="secondary">
                            ← Back
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Return Information */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Return Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-sm text-neutral-500">Return Number</p>
                        <p className="font-medium">{returnItem.reference_number}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Status</p>
                        {getStatusBadge(returnItem.status)}
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Total Return Amount</p>
                        <p className="font-medium text-primary-600">
                            {typeof returnItem.total_return_amount === 'string'
                                ? parseFloat(returnItem.total_return_amount).toFixed(2)
                                : '0.00'}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Created</p>
                        <p className="font-medium">{new Date(returnItem.created_at).toLocaleString()}</p>
                    </div>
                    {returnItem.accepted_at && (
                        <div>
                            <p className="text-sm text-neutral-500">Accepted</p>
                            <p className="font-medium">{new Date(returnItem.accepted_at).toLocaleString()}</p>
                        </div>
                    )}
                    {returnItem.accepted_by && (
                        <div>
                            <p className="text-sm text-neutral-500">Accepted By</p>
                            <p className="font-medium">{returnItem.accepted_by}</p>
                        </div>
                    )}
                    {returnItem.note && (
                        <div className="col-span-full">
                            <p className="text-sm text-neutral-500">Note</p>
                            <p className="font-medium">{returnItem.note}</p>
                        </div>
                    )}
                </div>
            </Card>

            {/* Return Items */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Returned Items</h3>
                {returnItem.items && returnItem.items.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-neutral-200">
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Product</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Quantity</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Unit Price</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {returnItem.items.map((item, index) => (
                                    <tr key={item.id || index} className="hover:bg-neutral-50">
                                        <td className="px-3 py-2 text-sm">{item.product_name}</td>
                                        <td className="px-3 py-2 text-sm">{item.quantity}</td>
                                        <td className="px-3 py-2 text-sm">
                                            {parseFloat(item.selling_price || 0).toFixed(2)}
                                        </td>
                                        <td className="px-3 py-2 text-sm text-right font-medium">
                                            {parseFloat(item.line_total || 0).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="border-t border-neutral-200">
                                <tr className="text-lg">
                                    <td colSpan="3" className="px-3 py-2 text-right font-bold">Total Return Amount:</td>
                                    <td className="px-3 py-2 text-right font-bold text-primary-600">
                                        {typeof returnItem.total_return_amount === 'string'
                                            ? parseFloat(returnItem.total_return_amount).toFixed(2)
                                            : '0.00'}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                ) : (
                    <p className="text-center text-neutral-500 py-4">No items in this return</p>
                )}
            </Card>

            {/* Shelf Allocation (put-away) - editable while pending, read-only afterwards */}
            {returnItem.items && returnItem.items.length > 0 && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Shelf Allocation (Put-Away)</h3>
                    {returnItem.status === 'pending' ? (
                        <div className="space-y-4">
                            {returnItem.items.map((item) => {
                                const state = shelfState[item.id] || { allocations: [], saving: false, error: '' };
                                return (
                                    <div key={item.id} className="border border-neutral-200 rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                                            <div>
                                                <p className="font-medium">
                                                    {item.product_name}{' '}
                                                    <span className="text-neutral-400 text-sm">({item.product_code})</span>
                                                </p>
                                                <p className="text-xs text-neutral-500">
                                                    Quantity: {item.quantity} • Allocated: {item.allocated_quantity}
                                                </p>
                                            </div>
                                        </div>
                                        <ShelfAllocationEditor
                                            value={state.allocations}
                                            onChange={(next) => handleAllocationChange(item.id, next)}
                                            onSearchShelves={searchShelvesForPutAway}
                                            requiredQuantity={item.quantity}
                                            mode="putaway"
                                            disabled={state.saving}
                                        />
                                        {state.error && (
                                            <p className="text-sm text-red-600 mt-2">{state.error}</p>
                                        )}
                                        <div className="flex justify-end mt-3">
                                            <Button
                                                size="sm"
                                                onClick={() => handleSaveAllocations(item.id)}
                                                loading={state.saving}
                                            >
                                                Save Allocations
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {returnItem.items.map((item) => (
                                <div key={item.id} className="text-sm">
                                    <p className="font-medium">
                                        {item.product_name}{' '}
                                        <span className="text-neutral-400">({item.product_code})</span>
                                    </p>
                                    {item.shelf_allocations?.length > 0 ? (
                                        <ul className="list-disc list-inside text-neutral-600">
                                            {item.shelf_allocations.map((a) => (
                                                <li key={a.id}>{a.shelf_name}: {a.quantity}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-neutral-400">No shelf allocations recorded</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}

            {/* Related Invoice */}
            {invoice && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Related Invoice</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <p className="text-sm text-neutral-500">Bill Number</p>
                            <Link
                                to={`/billing/invoices/${invoice.id}`}
                                className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
                            >
                                {invoice.bill_number}
                            </Link>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Customer</p>
                            <p className="font-medium">{invoice.customer?.name || 'N/A'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Invoice Status</p>
                            <InvoiceStatusBadge status={invoice.status} />
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Payment Status</p>
                            <PaymentStatusBadge status={invoice.payment_status} />
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Grand Total</p>
                            <p className="font-medium">
                                {typeof invoice.grand_total === 'string'
                                    ? parseFloat(invoice.grand_total).toFixed(2)
                                    : '0.00'}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Confirmed At</p>
                            <p className="font-medium">
                                {invoice.confirmed_at ? new Date(invoice.confirmed_at).toLocaleDateString() : 'N/A'}
                            </p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <Link to={`/billing/invoices/${invoice.id}`}>
                            <Button variant="secondary" size="sm">
                                View Full Invoice
                            </Button>
                        </Link>
                    </div>
                </Card>
            )}

            {/* Actions */}
            {returnItem.status === 'pending' && isAdmin && (
                <div className="flex gap-3 pt-4 border-t border-neutral-200">
                    <Button variant="success" onClick={handleAcceptReturn}>
                        Accept Return
                    </Button>
                </div>
            )}
        </div>
    );
};

export default ReturnDetailPage;