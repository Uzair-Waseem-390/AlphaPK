import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import OrderStatusBadge from '../../components/purchases/OrderStatusBadge';
import OrderPaymentStatusBadge from '../../components/purchases/OrderPaymentStatusBadge';
import ShelfAllocationEditor from '../../components/shared/ShelfAllocationEditor';

const PurchaseReturnDetailPage = () => {
    const { returnId } = useParams();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [returnItem, setReturnItem] = useState(null);
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [candidateShelves, setCandidateShelves] = useState({});
    const [allocationDrafts, setAllocationDrafts] = useState({});
    const [savingAllocationFor, setSavingAllocationFor] = useState(null);
    const [acceptError, setAcceptError] = useState('');

    useEffect(() => {
        fetchReturnDetails();
    }, [returnId]);

    // The read serializer only exposes product_name/product_code on a return
    // item (no product id) — resolve each item's product id by matching
    // product_code against the related order's items (which do carry the
    // id), then fetch that product's candidate shelves (already a small,
    // bounded set — only shelves currently holding stock of it) for a
    // plain dropdown.
    useEffect(() => {
        if (!returnItem?.items || !order?.items) return;

        setAllocationDrafts((prev) => {
            const next = { ...prev };
            returnItem.items.forEach((item) => {
                next[item.id] = (item.shelf_allocations || []).map((a) => ({
                    shelf_id: a.shelf.id,
                    quantity: a.quantity,
                }));
            });
            return next;
        });

        if (returnItem.status !== 'pending') return;

        returnItem.items.forEach((item) => {
            const orderItem = order.items.find((oi) => oi.product_code === item.product_code);
            if (!orderItem) return;
            purchasesApi.shelves.getCandidates(orderItem.product)
                .then((res) => {
                    const list = Array.isArray(res) ? res : (res?.results ?? []);
                    setCandidateShelves((prev) => ({ ...prev, [item.id]: list }));
                })
                .catch((error) => console.error('Failed to fetch candidate shelves:', error));
        });
    }, [returnItem, order]);

    const handleSaveAllocations = async (itemId) => {
        const allocations = (allocationDrafts[itemId] || [])
            .filter((a) => a.shelf_id && a.quantity)
            .map((a) => ({ shelf_id: parseInt(a.shelf_id, 10), quantity: parseInt(a.quantity, 10) }));
        setSavingAllocationFor(itemId);
        try {
            await purchasesApi.purchaseReturnItems.setShelfAllocations(itemId, allocations);
            await fetchReturnDetails();
        } catch (error) {
            console.error('Failed to save shelf allocations:', error);
            const errorMsg = error.response?.data?.detail || error.response?.data?.message
                || error.response?.data?.allocations || 'Failed to save shelf allocations';
            alert(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
        } finally {
            setSavingAllocationFor(null);
        }
    };

    const fetchReturnDetails = async () => {
        setLoading(true);
        try {
            const returnsRes = await purchasesApi.returns.getAll({ page_size: 500 });
            const allReturns = returnsRes?.results ?? returnsRes ?? [];
            const foundReturn = allReturns.find(r => r.id === parseInt(returnId));

            if (foundReturn) {
                setReturnItem(foundReturn);

                try {
                    const orderData = await purchasesApi.orders.getById(foundReturn.order);
                    setOrder(orderData);
                } catch (orderError) {
                    console.error('Failed to fetch related order:', orderError);
                    setOrder(null);
                }
            } else {
                setReturnItem(null);
                setOrder(null);
            }
        } catch (error) {
            console.error('Failed to fetch return details:', error);
            setReturnItem(null);
            setOrder(null);
        } finally {
            setLoading(false);
        }
    };

    const handleAcceptReturn = async () => {
        if (!window.confirm('Are you sure you want to accept this return?')) return;
        setAcceptError('');
        try {
            await purchasesApi.returns.accept(returnId);
            await fetchReturnDetails();
            alert('Return accepted successfully!');
        } catch (error) {
            console.error('Failed to accept return:', error);
            const errorMsg = error.response?.data?.detail || error.response?.data?.message || 'Failed to accept return';
            setAcceptError(errorMsg);
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
                <Link to="/purchases/returns" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Returns
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link to="/purchases/returns" className="text-sm text-primary-600 hover:text-primary-700">
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
                    <Link to="/purchases/returns">
                        <Button variant="secondary">
                            ← Back
                        </Button>
                    </Link>
                </div>
            </div>

            {acceptError && (
                <div className="p-4 rounded-lg bg-error-50 border border-error-200 text-sm text-error-700">
                    {acceptError}
                </div>
            )}

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
                        <p className="text-sm text-neutral-500">Total Return Amount (PKR)</p>
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
                    {returnItem.total_return_gross && parseFloat(returnItem.total_return_gross) > 0 && (
                        <div>
                            <p className="text-sm text-neutral-500">Gross Amount (PKR)</p>
                            <p className="font-medium">{parseFloat(returnItem.total_return_gross).toFixed(2)}</p>
                        </div>
                    )}
                    {returnItem.total_return_gst && parseFloat(returnItem.total_return_gst) > 0 && (
                        <div>
                            <p className="text-sm text-neutral-500">GST Amount (PKR)</p>
                            <p className="font-medium">{parseFloat(returnItem.total_return_gst).toFixed(2)}</p>
                        </div>
                    )}
                    {returnItem.total_return_wht && parseFloat(returnItem.total_return_wht) > 0 && (
                        <div>
                            <p className="text-sm text-neutral-500">WHT Amount (PKR)</p>
                            <p className="font-medium">{parseFloat(returnItem.total_return_wht).toFixed(2)}</p>
                        </div>
                    )}
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
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">GST%</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">WHT%</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {returnItem.items.map((item, index) => (
                                    <tr key={item.id || index} className="hover:bg-neutral-50">
                                        <td className="px-3 py-2 text-sm">
                                            {item.product_name}
                                            {item.shelf_allocations?.length > 0 && (
                                                <ul className="mt-1 text-xs text-neutral-500 space-y-0.5">
                                                    {item.shelf_allocations.map((a) => (
                                                        <li key={a.id}>{a.shelf.name}: {a.quantity}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-sm">{item.quantity}</td>
                                        <td className="px-3 py-2 text-sm">
                                            {typeof item.unit_price === 'string'
                                                ? parseFloat(item.unit_price).toFixed(2)
                                                : '0.00'}
                                        </td>
                                        <td className="px-3 py-2 text-sm">{item.gst || 0}%</td>
                                        <td className="px-3 py-2 text-sm">{item.wht || 0}%</td>
                                        <td className="px-3 py-2 text-sm text-right font-medium">
                                            {typeof item.total_amount === 'string'
                                                ? parseFloat(item.total_amount).toFixed(2)
                                                : '0.00'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="border-t border-neutral-200">
                                <tr className="text-lg">
                                    <td colSpan="5" className="px-3 py-2 text-right font-bold">Total Return Amount:</td>
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

            {/* Shelf Allocation — pending returns only, required before accept */}
            {returnItem.status === 'pending' && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Shelf Allocation</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Select which shelf(s) each returned item is being pulled from before accepting this return.
                    </p>
                    <div className="space-y-6">
                        {returnItem.items?.map((item) => (
                            <div key={item.id} className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
                                <div className="mb-3">
                                    <p className="font-medium">{item.product_name} {item.product_code ? `(${item.product_code})` : ''}</p>
                                    <p className="text-sm text-neutral-500">Quantity: {item.quantity}</p>
                                </div>
                                <ShelfAllocationEditor
                                    value={allocationDrafts[item.id] || []}
                                    onChange={(next) => setAllocationDrafts((prev) => ({ ...prev, [item.id]: next }))}
                                    shelves={candidateShelves[item.id] || []}
                                    requiredQuantity={item.quantity}
                                    mode="consumption"
                                    disabled={savingAllocationFor === item.id}
                                />
                                <div className="flex justify-end mt-3">
                                    <Button
                                        size="sm"
                                        onClick={() => handleSaveAllocations(item.id)}
                                        loading={savingAllocationFor === item.id}
                                    >
                                        Save Allocations
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Related Order */}
            {order && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Related Order</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <p className="text-sm text-neutral-500">Order Number</p>
                            <Link
                                to={`/purchases/orders/${order.id}`}
                                className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
                            >
                                {order.order_number}
                            </Link>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Supplier</p>
                            <p className="font-medium">{order.supplier?.name || 'N/A'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Order Status</p>
                            <OrderStatusBadge status={order.status} />
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Payment Status</p>
                            <OrderPaymentStatusBadge status={order.payment_status} />
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Net Payable</p>
                            <p className="font-medium">
                                {typeof order.net_payable === 'string'
                                    ? parseFloat(order.net_payable).toFixed(2)
                                    : '0.00'}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-neutral-500">Confirmed At</p>
                            <p className="font-medium">
                                {order.confirmed_at ? new Date(order.confirmed_at).toLocaleDateString() : 'N/A'}
                            </p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <Link to={`/purchases/orders/${order.id}`}>
                            <Button variant="secondary" size="sm">
                                View Full Order
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

export default PurchaseReturnDetailPage;
