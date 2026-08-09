import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { billingApi } from '../../services/billingApi';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import InvoiceStatusBadge from '../../components/billing/InvoiceStatusBadge';
import PaymentStatusBadge from '../../components/billing/PaymentStatusBadge';
import PaymentSummaryCard from '../../components/billing/PaymentSummaryCard';
import PaymentHistoryList from '../../components/billing/PaymentHistoryList';
import PaymentForm from '../../components/billing/PaymentForm';
import ReturnList from '../../components/billing/ReturnList';
import ReturnForm from '../../components/billing/ReturnForm';
import SavePDFModal from '../../components/billing/SavePDFModal';
import DraftPreviewPanel from '../../components/billing/DraftPreviewPanel';
import ExtendDueDateModal from '../../components/billing/ExtendDueDateModal';
import Modal from '../../components/ui/Modal';
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

const InvoiceDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [invoice, setInvoice] = useState(null);
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
    const [showExtendDueDate, setShowExtendDueDate] = useState(false);
    const [dueDateSaving, setDueDateSaving] = useState(false);
    // Per invoice-item shelf allocation UI state, keyed by invoice item id:
    // { candidates: [{id, name, available_quantity}], allocations: [{shelf_id, quantity}], saving: bool, error: string }
    const [shelfState, setShelfState] = useState({});

    useEffect(() => {
        fetchData();
    }, [id]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [invoiceData, summaryData] = await Promise.all([
                billingApi.invoices.getById(id),
                billingApi.invoices.getPaymentSummary(id),
            ]);
            setInvoice(invoiceData);
            setPaymentSummary(summaryData);

            // Fetch additional data with error catching for each request
            const [paymentsData, returnsData, pdfsData] = await Promise.all([
                billingApi.payments.getByInvoice(id, { page_size: 500 }).catch(() => []),
                billingApi.returns.getByInvoice(id, { page_size: 500 }).catch(() => []),
                invoiceData?.status !== 'draft'
                    ? billingApi.invoices.getPDFs(id).catch(() => [])
                    : Promise.resolve([]),
            ]);
            const paymentsList = paymentsData?.results ?? paymentsData ?? [];
            const returnsList = returnsData?.results ?? returnsData ?? [];
            setPayments(paymentsList);
            setReturns(returnsList);
            setPdfs(pdfsData?.results ?? pdfsData ?? []);

            // Check if there's a pending return
            const hasPending = returnsList.some(r => r.status === 'pending');
            setHasPendingReturn(hasPending);

            // Draft invoices need shelf allocation candidates per item so the
            // allocator can be populated (confirmed invoices only show the
            // saved allocations read-only, no candidates fetch needed).
            // Candidates are already a small, bounded set (only shelves
            // currently holding stock of that product), so a plain dropdown.
            if (invoiceData?.status === 'draft' && invoiceData.items?.length) {
                const entries = await Promise.all(invoiceData.items.map(async (item) => {
                    try {
                        const candidates = await billingApi.shelves.getCandidates(item.product);
                        return [item.id, candidates?.results ?? candidates ?? []];
                    } catch (err) {
                        console.error(`Failed to fetch candidate shelves for item ${item.id}:`, err);
                        return [item.id, []];
                    }
                }));
                const candidatesByItemId = Object.fromEntries(entries);
                setShelfState((prev) => {
                    const next = {};
                    invoiceData.items.forEach((item) => {
                        next[item.id] = {
                            candidates: candidatesByItemId[item.id] || [],
                            allocations: (item.shelf_allocations || []).map((a) => ({
                                shelf_id: a.shelf_id,
                                quantity: a.quantity,
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
        } catch (error) {
            console.error('Failed to fetch invoice details:', error);
        } finally {
            setLoading(false);
        }
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
            await billingApi.invoiceItems.setShelfAllocations(itemId, allocations);
            await fetchData();
        } catch (error) {
            console.error('Failed to save shelf allocations:', error);
            const message = extractErrorMessage(error, 'Failed to save shelf allocations.');
            setShelfState((prev) => ({
                ...prev,
                [itemId]: { ...prev[itemId], saving: false, error: message },
            }));
        }
    };

    const handlePrint = async () => {
        const isDraft = invoice?.status === 'draft';
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                alert('Please login again to print');
                return;
            }

            const response = await fetch(
                `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/billing/invoices/${id}/print/?is_draft=${isDraft}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                }
            );

            if (!response.ok) {
                throw new Error('Failed to print invoice');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');

            setTimeout(() => {
                window.URL.revokeObjectURL(url);
            }, 1000);
        } catch (error) {
            console.error('Failed to print:', error);
            alert('Failed to print invoice. Please try again.');
        }
    };

    const handleSavePDF = async (fileName) => {
        setFormLoading(true);
        try {
            await billingApi.invoices.savePDF(id, { file_name: fileName });
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
            await billingApi.invoices.deletePDF(pdfId);
            await fetchData();
        } catch (error) {
            console.error('Failed to delete PDF:', error);
        }
    };

    const handleRecordPayment = async (data) => {
        setFormLoading(true);
        try {
            await billingApi.payments.create(id, data);
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
            await billingApi.payments.delete(paymentId);
            await fetchData();
        } catch (error) {
            console.error('Failed to delete payment:', error);
        }
    };

    const handleCreateReturn = async (data) => {
        setFormLoading(true);
        try {
            await billingApi.returns.create(id, data);
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
            await billingApi.returns.accept(returnId);
            await fetchData();
        } catch (error) {
            console.error('Failed to accept return:', error);
            // Shelf allocation can only be edited on the return's own detail
            // page (components/billing/ReturnList.jsx here is a compact
            // summary widget with no room for the allocator UI), so point
            // the user there when acceptance is blocked on incomplete
            // allocations.
            alert(
                `${extractErrorMessage(error, 'Failed to accept return.')} `
                + 'Open the return\'s detail page to allocate shelves.'
            );
        }
    };

    const handleConfirmInvoice = async () => {
        if (!window.confirm('Are you sure you want to confirm this invoice?')) return;
        try {
            await billingApi.invoices.confirm(id);
            await fetchData();
        } catch (error) {
            console.error('Failed to confirm invoice:', error);
            alert(extractErrorMessage(error, 'Failed to confirm invoice.'));
        }
    };

    const handleDeleteInvoice = async () => {
        if (!window.confirm('Are you sure you want to delete this draft invoice?')) return;
        try {
            await billingApi.invoices.delete(id);
            navigate('/billing/invoices');
        } catch (error) {
            console.error('Failed to delete invoice:', error);
        }
    };

    const handleSaveDueDate = async (newDueDate) => {
        setDueDateSaving(true);
        try {
            await billingApi.invoices.updateDueDate(id, newDueDate);
            setShowExtendDueDate(false);
            await fetchData();
        } finally {
            setDueDateSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!invoice) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Invoice Not Found</h2>
                <Link to="/billing/invoices" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Invoices
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <Link to="/billing/invoices" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Invoices
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">{invoice.bill_number}</h1>
                    <div className="flex gap-2 mt-1 flex-wrap">
                        <InvoiceStatusBadge status={invoice.status} />
                        <PaymentStatusBadge status={invoice.payment_status} />
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                    {/* Print button hidden while invoice is draft */}
                    {invoice.status !== 'draft' && (
                        <Button variant="secondary" onClick={handlePrint}>
                            Print
                        </Button>
                    )}

                    {invoice.status !== 'draft' && isAdmin && (
                        <>
                            <Button variant="secondary" onClick={() => setShowSavePDFModal(true)}>
                                Save PDF
                            </Button>
                            <Button variant="secondary" onClick={() => setShowPaymentForm(true)}>
                                Record Payment
                            </Button>
                            {!hasPendingReturn && invoice.status !== 'returned' && (
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

                    {invoice.status !== 'draft' && invoice.payment_status !== 'paid' && isAdmin && (
                        <Button variant="secondary" onClick={() => setShowExtendDueDate(true)}>
                            Extend Due Date
                        </Button>
                    )}

                    {invoice.status === 'draft' && (
                        <>
                            <Button variant="secondary" onClick={() => navigate(`/billing/invoices/${id}/edit`)}>
                                Edit
                            </Button>
                            {isAdmin && (
                                <Button variant="success" onClick={handleConfirmInvoice}>
                                    Confirm
                                </Button>
                            )}
                            <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
                                Delete
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Customer Info */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Customer Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-sm text-neutral-500">Name</p>
                        <p className="font-medium">{invoice.customer?.name || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Code</p>
                        <p className="font-medium">{invoice.customer?.code || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Address</p>
                        <p className="font-medium">{invoice.customer?.address || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Mobile</p>
                        <p className="font-medium">{invoice.customer?.mobile || 'N/A'}</p>
                    </div>
                    {invoice.payment_type === 'advance' && parseFloat(invoice.advance_amount) > 0 && (
                        <div>
                            <p className="text-sm text-neutral-500">Advance Amount (PKR)</p>
                            <p className="font-medium">{parseFloat(invoice.advance_amount).toFixed(2)}</p>
                        </div>
                    )}
                    {invoice.payment_due_date && (
                        <div>
                            <p className="text-sm text-neutral-500">Due Date</p>
                            <p className="font-medium">{new Date(invoice.payment_due_date).toLocaleDateString()}</p>
                        </div>
                    )}
                </div>
            </Card>

            {/* Payment Summary */}
            {paymentSummary && invoice.status !== 'draft' && (
                <PaymentSummaryCard summary={paymentSummary} />
            )}

            {/* Invoice Items */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Items</h3>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-neutral-200">
                                <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Product</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Qty</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Discount</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">GST%</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">WHT%</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500">Effective Price</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {invoice.items?.map((item, index) => (
                                <tr key={item.id || index} className="hover:bg-neutral-50">
                                    <td className="px-3 py-2 text-sm">{item.product_name || 'N/A'}</td>
                                    <td className="px-3 py-2 text-sm">{item.quantity}</td>
                                    <td className="px-3 py-2 text-sm">{item.discount || 0}</td>
                                    <td className="px-3 py-2 text-sm">{item.gst || 0}%</td>
                                    <td className="px-3 py-2 text-sm">{item.wht || 0}%</td>
                                    <td className="px-3 py-2 text-sm text-right">
                                        {item.effective_price ? parseFloat(item.effective_price).toFixed(2) : '0.00'}
                                    </td>
                                    <td className="px-3 py-2 text-sm text-right font-medium">
                                        {item.line_total ? parseFloat(item.line_total).toFixed(2) : '0.00'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="border-t border-neutral-200">
                            <tr>
                                <td colSpan="6" className="px-3 py-2 text-right font-medium">Subtotal:</td>
                                <td className="px-3 py-2 text-right font-medium">
                                    {invoice.subtotal ? parseFloat(invoice.subtotal).toFixed(2) : '0.00'}
                                </td>
                            </tr>
                            <tr>
                                <td colSpan="6" className="px-3 py-2 text-right font-medium">GST Total:</td>
                                <td className="px-3 py-2 text-right font-medium">
                                    {invoice.gst_total ? parseFloat(invoice.gst_total).toFixed(2) : '0.00'}
                                </td>
                            </tr>
                            <tr>
                                <td colSpan="6" className="px-3 py-2 text-right font-medium">WHT Total:</td>
                                <td className="px-3 py-2 text-right font-medium">
                                    {invoice.wht_total ? parseFloat(invoice.wht_total).toFixed(2) : '0.00'}
                                </td>
                            </tr>
                            <tr className="text-lg">
                                <td colSpan="6" className="px-3 py-2 text-right font-bold">Grand Total:</td>
                                <td className="px-3 py-2 text-right font-bold text-primary-600">
                                    {invoice.grand_total ? parseFloat(invoice.grand_total).toFixed(2) : '0.00'}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </Card>

            {/* Shelf Allocation - editable while draft, read-only afterwards */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Shelf Allocation</h3>
                {invoice.status === 'draft' ? (
                    <div className="space-y-4">
                        {invoice.items?.map((item) => {
                            const state = shelfState[item.id] || {
                                candidates: [], allocations: [], saving: false, error: '',
                            };
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
                                        shelves={state.candidates}
                                        requiredQuantity={item.quantity}
                                        mode="consumption"
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
                        {invoice.items?.map((item) => (
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

            {/* Draft Preview - Only for draft invoices */}
            {invoice.status === 'draft' && invoice.draft_preview && (
                <div>
                    <h3 className="font-semibold text-neutral-900 mb-3">Draft Preview (Estimated)</h3>
                    <DraftPreviewPanel preview={invoice.draft_preview} />
                </div>
            )}

            {/* Payments Section - Only for confirmed invoices, hidden from normal users */}
            {invoice.status !== 'draft' && isAdmin && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Payment History</h3>
                    <PaymentHistoryList
                        payments={payments}
                        onDelete={handleDeletePayment}
                        isAdmin={isAdmin}
                    />
                </Card>
            )}

            {/* Returns Section - Only for confirmed invoices */}
            {invoice.status !== 'draft' && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Returns</h3>
                    <ReturnList
                        returns={returns}
                        onAccept={handleAcceptReturn}
                        isAdmin={isAdmin}
                    />
                </Card>
            )}

            {/* Saved PDFs - Only for confirmed invoices */}
            {invoice.status !== 'draft' && pdfs.length > 0 && (
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
                    maxAmount={paymentSummary?.credit_outstanding ? parseFloat(paymentSummary.credit_outstanding) : undefined}
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
                    orderItems={invoice.items || []}
                />
            </Modal>

            {/* Save PDF Modal */}
            <SavePDFModal
                isOpen={showSavePDFModal}
                onClose={() => setShowSavePDFModal(false)}
                onSubmit={handleSavePDF}
                loading={formLoading}
                defaultFileName={invoice.bill_number}
            />

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                title="Delete Invoice"
            >
                <div className="space-y-4">
                    <p className="text-neutral-600">
                        Are you sure you want to delete this draft invoice? This action cannot be undone.
                    </p>
                    {invoice.payment_type === 'advance' && parseFloat(invoice.advance_amount) > 0 && (
                        <p className="text-sm text-warning-600 bg-warning-50 border border-warning-200 rounded-lg p-3">
                            This invoice has an advance payment of PKR {parseFloat(invoice.advance_amount).toFixed(2)} —
                            deleting it will refund this amount by removing it from cash-in-hand.
                        </p>
                    )}
                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            variant="secondary"
                            onClick={() => setShowDeleteConfirm(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleDeleteInvoice}
                        >
                            Delete Invoice
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Extend Due Date Modal */}
            <ExtendDueDateModal
                isOpen={showExtendDueDate}
                onClose={() => setShowExtendDueDate(false)}
                onSubmit={handleSaveDueDate}
                currentDueDate={invoice.payment_due_date}
                loading={dueDateSaving}
            />
        </div>
    );
};

export default InvoiceDetailPage;