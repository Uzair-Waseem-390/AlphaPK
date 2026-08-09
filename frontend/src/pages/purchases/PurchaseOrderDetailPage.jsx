import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import OrderStatusBadge from '../../components/purchases/OrderStatusBadge';
import OrderPaymentStatusBadge from '../../components/purchases/OrderPaymentStatusBadge';
import OrderSummaryCard from '../../components/purchases/OrderSummaryCard';
import PaymentHistoryList from '../../components/purchases/PaymentHistoryList';
import PaymentForm from '../../components/purchases/PaymentForm';
import ReturnList from '../../components/purchases/ReturnList';
import ReturnForm from '../../components/purchases/ReturnForm';
import SavePDFModal from '../../components/purchases/SavePDFModal';
import PurchaseOrderFormModal from '../../components/purchases/PurchaseOrderFormModal';
import ShelfAllocationEditor from '../../components/shared/ShelfAllocationEditor';

const PurchaseOrderDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [order, setOrder] = useState(null);
    const [paymentSummary, setPaymentSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [showReturnForm, setShowReturnForm] = useState(false);
    const [showSavePDFModal, setShowSavePDFModal] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [pdfs, setPdfs] = useState([]);
    const [returns, setReturns] = useState([]);
    const [payments, setPayments] = useState([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [hasPendingReturn, setHasPendingReturn] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [allocationDrafts, setAllocationDrafts] = useState({});
    const [savingAllocationFor, setSavingAllocationFor] = useState(null);
    const [confirmError, setConfirmError] = useState('');

    useEffect(() => {
        fetchData();
    }, [id]);

    // Keep per-item allocation drafts in sync with the order's saved state
    // (initial load and after every refetch following a save/confirm).
    useEffect(() => {
        if (!order?.items) return;
        setAllocationDrafts((prev) => {
            const next = { ...prev };
            order.items.forEach((item) => {
                next[item.id] = (item.shelf_allocations || []).map((a) => ({
                    shelf_id: a.shelf.id,
                    quantity: a.quantity,
                    shelf_name: a.shelf.name,
                }));
            });
            return next;
        });
    }, [order]);

    // Put-away — any shelf is valid, so this searches the full shelf list by
    // name (a large factory can have hundreds of shelves, so this is a live
    // backend search, not a preloaded dropdown).
    const searchShelvesForPutAway = async (query) => {
        const res = await purchasesApi.shelves.getAll({ search: query, page_size: 25 });
        const results = res?.results ?? res ?? [];
        return results.map((s) => ({ value: s.id, label: s.name, name: s.name }));
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [orderData, summaryData] = await Promise.all([
                purchasesApi.orders.getById(id),
                purchasesApi.orders.getPaymentSummary(id),
            ]);
            setOrder(orderData);
            setPaymentSummary(summaryData);

            const [paymentsRes, returnsRes, pdfsData] = await Promise.all([
                purchasesApi.payments.getByOrder(id).catch(() => []),
                purchasesApi.returns.getByOrder(id).catch(() => []),
                orderData?.status === 'confirmed'
                    ? purchasesApi.orders.getPDFs(id).catch(() => [])
                    : Promise.resolve([]),
            ]);
            // payments/returns endpoints now return paginated {results: [...]} objects
            // instead of plain arrays; unwrap both shapes.
            const paymentsData = Array.isArray(paymentsRes) ? paymentsRes : (paymentsRes?.results || []);
            const returnsData = Array.isArray(returnsRes) ? returnsRes : (returnsRes?.results || []);
            setPayments(paymentsData);
            setReturns(returnsData);
            setPdfs(Array.isArray(pdfsData) ? pdfsData : (pdfsData?.results || []));

            const hasPending = returnsData.some(r => r.status === 'pending');
            setHasPendingReturn(hasPending);
        } catch (error) {
            console.error('Failed to fetch order details:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = async () => {
        try {
            const isDraft = order?.status === 'draft';
            const data = await purchasesApi.orders.print(id, isDraft);
            const blob = new Blob([data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
            }, 1000);
        } catch (error) {
            console.error('Failed to print order:', error);
            alert('Failed to print order. Please try again.');
        }
    };

    const handleSavePDF = async (fileName) => {
        setFormLoading(true);
        try {
            await purchasesApi.orders.savePDF(id, { file_name: fileName });
            setShowSavePDFModal(false);
            await fetchData();
        } catch (error) {
            console.error('Failed to save PDF:', error);
            alert(error.response?.data?.detail || 'Failed to save PDF');
        } finally {
            setFormLoading(false);
        }
    };

    const handleDeletePDF = async (pdfId) => {
        if (!window.confirm('Are you sure you want to delete this PDF?')) return;
        try {
            await purchasesApi.orders.deletePDF(pdfId);
            await fetchData();
        } catch (error) {
            console.error('Failed to delete PDF:', error);
        }
    };

    const handleRecordPayment = async (data) => {
        setFormLoading(true);
        try {
            await purchasesApi.payments.create(id, data);
            setShowPaymentForm(false);
            await fetchData();
            alert('Payment recorded successfully!');
        } catch (error) {
            console.error('Failed to record payment:', error);
            alert(error.response?.data?.detail || 'Failed to record payment');
        } finally {
            setFormLoading(false);
        }
    };

    const handleDeletePayment = async (paymentId) => {
        if (!window.confirm('Are you sure you want to delete this payment?')) return;
        try {
            await purchasesApi.payments.delete(paymentId);
            await fetchData();
        } catch (error) {
            console.error('Failed to delete payment:', error);
        }
    };

    const handleCreateReturn = async (data) => {
        setFormLoading(true);
        try {
            await purchasesApi.returns.create(id, data);
            setShowReturnForm(false);
            await fetchData();
            alert('Return created successfully!');
        } catch (error) {
            console.error('Failed to create return:', error);
            const errorMsg = error.response?.data?.detail || error.response?.data?.message || 'Failed to create return';
            alert(errorMsg);
        } finally {
            setFormLoading(false);
        }
    };

    const handleAcceptReturn = async (returnId) => {
        if (!window.confirm('Are you sure you want to accept this return?')) return;
        try {
            await purchasesApi.returns.accept(returnId);
            await fetchData();
        } catch (error) {
            console.error('Failed to accept return:', error);
        }
    };

    const handleConfirmOrder = async () => {
        if (!window.confirm('Are you sure you want to confirm this order?')) return;
        setConfirmError('');
        try {
            await purchasesApi.orders.confirm(id);
            await fetchData();
        } catch (error) {
            console.error('Failed to confirm order:', error);
            const errorMsg = error.response?.data?.detail || error.response?.data?.message || 'Failed to confirm order';
            setConfirmError(errorMsg);
        }
    };

    const handleSaveAllocations = async (itemId) => {
        const allocations = (allocationDrafts[itemId] || [])
            .filter((a) => a.shelf_id && a.quantity)
            .map((a) => ({ shelf_id: parseInt(a.shelf_id, 10), quantity: parseInt(a.quantity, 10) }));
        setSavingAllocationFor(itemId);
        try {
            await purchasesApi.purchaseItems.setShelfAllocations(itemId, allocations);
            await fetchData();
        } catch (error) {
            console.error('Failed to save shelf allocations:', error);
            const errorMsg = error.response?.data?.detail || error.response?.data?.message
                || error.response?.data?.allocations || 'Failed to save shelf allocations';
            alert(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
        } finally {
            setSavingAllocationFor(null);
        }
    };

    const handleOpenEdit = () => {
        setShowEditModal(true);
    };

    const searchProducts = async (query) => {
        const res = await purchasesApi.products.getAll({ search: query, page_size: 25 });
        const results = res?.results ?? res ?? [];
        return results.map(p => ({ value: p.id, label: `${p.code} - ${p.name}` }));
    };

    // Supplier is disabled/read-only on edit (see PurchaseOrderFormModal), so
    // this only exists to satisfy the shared modal's required prop.
    const searchSuppliers = async (query) => {
        const res = await purchasesApi.suppliers.getAll({ search: query });
        const results = res?.results ?? res ?? [];
        return results.map(s => ({ value: s.id, label: `${s.name} (${s.code})` }));
    };

    const handleUpdateOrder = async (payload) => {
        await purchasesApi.orders.update(id, payload);
        setShowEditModal(false);
        await fetchData();
    };

    const handleDeleteOrder = async () => {
        try {
            await purchasesApi.orders.delete(id);
            navigate('/purchases/orders');
        } catch (error) {
            console.error('Failed to delete order:', error);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Order Not Found</h2>
                <Link to="/purchases/orders" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Orders
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <Link to="/purchases/orders" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Orders
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">{order.order_number}</h1>
                    <div className="flex gap-2 mt-1 flex-wrap">
                        <OrderStatusBadge status={order.status} />
                        <OrderPaymentStatusBadge status={order.payment_status} />
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                    {/* Print button hidden while order is draft */}
                    {order.status !== 'draft' && (
                        <Button variant="secondary" onClick={handlePrint}>
                            Print
                        </Button>
                    )}

                    {order.status === 'confirmed' && (
                        <>
                            {isAdmin && (
                                <Button variant="secondary" onClick={() => setShowSavePDFModal(true)}>
                                    Save PDF
                                </Button>
                            )}
                            <Button variant="secondary" onClick={() => setShowPaymentForm(true)}>
                                Record Payment
                            </Button>
                            {!hasPendingReturn && (
                                <Button variant="secondary" onClick={() => setShowReturnForm(true)}>
                                    Create Return
                                </Button>
                            )}
                            {hasPendingReturn && (
                                <Badge variant="warning" className="ml-2">
                                    Return Pending
                                </Badge>
                            )}
                        </>
                    )}

                    {order.status === 'draft' && isAdmin && (
                        <>
                            <Button variant="secondary" onClick={handleOpenEdit}>
                                Edit
                            </Button>
                            <Button variant="success" onClick={handleConfirmOrder}>
                                Confirm
                            </Button>
                            <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
                                Delete
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {confirmError && (
                <div className="p-4 rounded-lg bg-error-50 border border-error-200 text-sm text-error-700">
                    {confirmError}
                </div>
            )}

            {/* Supplier Info */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Supplier Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-sm text-neutral-500">Name</p>
                        <p className="font-medium">{order.supplier?.name || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Code</p>
                        <p className="font-medium">{order.supplier?.code || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Payment Type</p>
                        <p className="font-medium capitalize">{order.payment_type?.replace('_', ' ') || 'N/A'}</p>
                    </div>
                    {order.advance_amount && parseFloat(order.advance_amount) > 0 && (
                        <div>
                            <p className="text-sm text-neutral-500">Advance Amount (PKR)</p>
                            <p className="font-medium">
                                {typeof order.advance_amount === 'string'
                                    ? parseFloat(order.advance_amount).toFixed(2)
                                    : '0.00'}
                            </p>
                        </div>
                    )}
                </div>
            </Card>

            {/* Payment Summary */}
            {paymentSummary && order.status !== 'draft' && (
                <OrderSummaryCard summary={paymentSummary} />
            )}

            {/* Order Items */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Items</h3>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-neutral-200">
                                <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Product</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Qty</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Unit Price</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">GST%</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">WHT%</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {order.items?.map((item, index) => (
                                <tr key={item.id || index} className="hover:bg-neutral-50">
                                    <td className="px-3 py-2 text-sm">
                                        {item.product_name || 'N/A'}
                                        {order.status !== 'draft' && item.shelf_allocations?.length > 0 && (
                                            <ul className="mt-1 text-xs text-neutral-500 space-y-0.5">
                                                {item.shelf_allocations.map((a) => (
                                                    <li key={a.id}>{a.shelf.name}: {a.quantity}</li>
                                                ))}
                                            </ul>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-sm">{item.quantity}</td>
                                    <td className="px-3 py-2 text-sm">
                                        {typeof item.unit_price === 'string' ? parseFloat(item.unit_price).toFixed(2) : '0.00'}
                                    </td>
                                    <td className="px-3 py-2 text-sm">{item.gst || 0}%</td>
                                    <td className="px-3 py-2 text-sm">{item.wht || 0}%</td>
                                    <td className="px-3 py-2 text-sm text-right font-medium">
                                        {item.total_price ? parseFloat(item.total_price).toFixed(2) : '0.00'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="border-t border-neutral-200">
                            <tr>
                                <td colSpan="5" className="px-3 py-2 text-right font-medium">Gross Amount:</td>
                                <td className="px-3 py-2 text-right font-medium">
                                    {order.gross_amount ? parseFloat(order.gross_amount).toFixed(2) : '0.00'}
                                </td>
                            </tr>
                            {order.gst_total && parseFloat(order.gst_total) > 0 && (
                                <tr>
                                    <td colSpan="5" className="px-3 py-2 text-right font-medium">GST Total:</td>
                                    <td className="px-3 py-2 text-right font-medium">
                                        {parseFloat(order.gst_total).toFixed(2)}
                                    </td>
                                </tr>
                            )}
                            {order.wht_total && parseFloat(order.wht_total) > 0 && (
                                <tr>
                                    <td colSpan="5" className="px-3 py-2 text-right font-medium">WHT Total:</td>
                                    <td className="px-3 py-2 text-right font-medium">
                                        {parseFloat(order.wht_total).toFixed(2)}
                                    </td>
                                </tr>
                            )}
                            <tr className="text-lg">
                                <td colSpan="5" className="px-3 py-2 text-right font-bold">Net Payable:</td>
                                <td className="px-3 py-2 text-right font-bold text-primary-600">
                                    {order.net_payable ? parseFloat(order.net_payable).toFixed(2) : '0.00'}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {order.description && (
                    <div className="mt-4 pt-4 border-t border-neutral-200">
                        <p className="text-sm text-neutral-500">Description</p>
                        <p className="font-medium">{order.description}</p>
                    </div>
                )}
            </Card>

            {/* Put-Away — shelf allocation for draft orders, required before confirm */}
            {order.status === 'draft' && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Put-Away (Shelf Allocation)</h3>
                    <p className="text-sm text-neutral-500 mb-4">
                        Allocate each item's full quantity to shelves before confirming this order.
                    </p>
                    <div className="space-y-6">
                        {order.items?.map((item) => (
                            <div key={item.id} className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <p className="font-medium">{item.product_name} {item.product_code ? `(${item.product_code})` : ''}</p>
                                        <p className="text-sm text-neutral-500">Quantity: {item.quantity}</p>
                                    </div>
                                </div>
                                <ShelfAllocationEditor
                                    value={allocationDrafts[item.id] || []}
                                    onChange={(next) => setAllocationDrafts((prev) => ({ ...prev, [item.id]: next }))}
                                    onSearchShelves={searchShelvesForPutAway}
                                    requiredQuantity={item.quantity}
                                    mode="putaway"
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

            {/* Payments Section - Only for confirmed orders */}
            {order.status !== 'draft' && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Payment History</h3>
                    <PaymentHistoryList
                        payments={payments}
                        onDelete={handleDeletePayment}
                        isAdmin={isAdmin}
                    />
                </Card>
            )}

            {/* Returns Section - Only for confirmed orders */}
            {order.status !== 'draft' && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Returns</h3>
                    <ReturnList
                        returns={returns}
                        onAccept={handleAcceptReturn}
                        isAdmin={isAdmin}
                    />
                </Card>
            )}

            {/* Saved PDFs - Only for confirmed orders */}
            {order.status !== 'draft' && pdfs.length > 0 && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Saved PDFs</h3>
                    <div className="space-y-2">
                        {pdfs.map((pdf) => (
                            <div key={pdf.id} className="flex justify-between items-center p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors">
                                <div>
                                    <a
                                        href={pdf.file_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
                                    >
                                        {pdf.file_name}
                                    </a>
                                    <p className="text-xs text-neutral-500">
                                        Saved: {new Date(pdf.created_at).toLocaleString()}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => handleDeletePDF(pdf.id)}
                                >
                                    Delete
                                </Button>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Edit Order Modal — draft orders only */}
            {order.status === 'draft' && (
                <PurchaseOrderFormModal
                    isOpen={showEditModal}
                    onClose={() => setShowEditModal(false)}
                    onSubmit={handleUpdateOrder}
                    onSearchProducts={searchProducts}
                    onSearchSuppliers={searchSuppliers}
                    title="Edit Purchase Order"
                    submitLabel="Save Changes"
                    initialData={{
                        supplier: order.supplier?.id || '',
                        supplier_label: order.supplier?.code ? `${order.supplier.name} (${order.supplier.code})` : order.supplier?.name,
                        payment_type: order.payment_type,
                        advance_amount: order.advance_amount || '',
                        description: order.description || '',
                        items: (order.items || []).map((item) => ({
                            product: item.product,
                            product_label: item.product_code ? `${item.product_code} - ${item.product_name}` : item.product_name,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            gst: item.gst,
                            wht: item.wht,
                            description: item.description || '',
                        })),
                    }}
                />
            )}

            {/* Payment Form Modal */}
            <Modal
                isOpen={showPaymentForm}
                onClose={() => setShowPaymentForm(false)}
                title="Record Payment"
            >
                <PaymentForm
                    onSubmit={handleRecordPayment}
                    onCancel={() => setShowPaymentForm(false)}
                    loading={formLoading}
                    maxAmount={paymentSummary?.payable_outstanding ? parseFloat(paymentSummary.payable_outstanding) : undefined}
                />
            </Modal>

            {/* Return Form Modal */}
            <Modal
                isOpen={showReturnForm}
                onClose={() => setShowReturnForm(false)}
                title="Create Return"
                size="lg"
            >
                <ReturnForm
                    onSubmit={handleCreateReturn}
                    onCancel={() => setShowReturnForm(false)}
                    loading={formLoading}
                    orderItems={order.items || []}
                />
            </Modal>

            {/* Save PDF Modal */}
            <SavePDFModal
                isOpen={showSavePDFModal}
                onClose={() => setShowSavePDFModal(false)}
                onSubmit={handleSavePDF}
                loading={formLoading}
                defaultFileName={order.order_number}
            />

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                title="Delete Order"
            >
                <div className="space-y-4">
                    <p className="text-neutral-600">
                        Are you sure you want to delete this draft order? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            variant="secondary"
                            onClick={() => setShowDeleteConfirm(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleDeleteOrder}
                        >
                            Delete Order
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default PurchaseOrderDetailPage;
