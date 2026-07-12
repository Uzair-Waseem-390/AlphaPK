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
import Modal from '../../components/ui/Modal';

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
            setPdfs(pdfsData || []);

            // Check if there's a pending return
            const hasPending = returnsList.some(r => r.status === 'pending');
            setHasPendingReturn(hasPending);
        } catch (error) {
            console.error('Failed to fetch invoice details:', error);
        } finally {
            setLoading(false);
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
        }
    };

    const handleConfirmInvoice = async () => {
        if (!window.confirm('Are you sure you want to confirm this invoice?')) return;
        try {
            await billingApi.invoices.confirm(id);
            await fetchData();
        } catch (error) {
            console.error('Failed to confirm invoice:', error);
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
        </div>
    );
};

export default InvoiceDetailPage;