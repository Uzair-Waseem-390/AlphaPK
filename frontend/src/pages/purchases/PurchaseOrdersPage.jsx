import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Tabs from '../../components/ui/Tabs';
import SearchBar from '../../components/ui/SearchBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import FilterBar from '../../components/ui/FilterBar';
import LineItemRow from '../../components/purchases/LineItemRow';
import DraftPreview from '../../components/purchases/DraftPreview';
import { useNavigate } from 'react-router-dom';

const PurchaseOrdersPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
    const navigate = useNavigate();

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('all');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [orderLoading, setOrderLoading] = useState(false);
    const [filters, setFilters] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [error, setError] = useState('');

    // Payment Summary Modal
    const [showPaymentSummary, setShowPaymentSummary] = useState(false);
    const [paymentSummary, setPaymentSummary] = useState(null);

    // Payment Detail Modal
    const [showPaymentDetail, setShowPaymentDetail] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState(null);

    // PDF Modal
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [pdfFileName, setPdfFileName] = useState('');
    const [pdfLoading, setPdfLoading] = useState(false);
    const [pdfs, setPdfs] = useState([]);

    // Add Payment Modal
    const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
    const [paymentFormData, setPaymentFormData] = useState({
        amount: '',
        method: 'cash',
        payment_date: new Date().toISOString().split('T')[0],
        note: '',
    });
    const [paymentLoading, setPaymentLoading] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        supplier: '',
        payment_type: 'after_delivery',
        advance_amount: '',
        description: '',
        items: [],
    });
    const [products, setProducts] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [formLoading, setFormLoading] = useState(false);

    const tabs = [
        { value: 'all', label: 'All Orders' },
        { value: 'drafts', label: 'Drafts' },
        { value: 'confirmed', label: 'Confirmed' },
        { value: 'outstanding', label: 'Outstanding' },
    ];

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        fetchOrders();
    }, [activeTab, filters, searchTerm]);

    const loadInitialData = async () => {
        try {
            const [productsRes, suppliersRes] = await Promise.all([
                purchasesApi.products.getAll(),
                purchasesApi.suppliers.getAll(),
            ]);
            setProducts(productsRes || []);
            setSuppliers(suppliersRes || []);
        } catch (error) {
            console.error('Failed to load initial data:', error);
        }
    };

    const fetchOrders = async () => {
        setLoading(true);
        try {
            let data;
            const params = { ...filters };

            if (searchTerm) {
                params.order_number = searchTerm;
            }

            switch (activeTab) {
                case 'drafts':
                    data = await purchasesApi.orders.getDrafts(params);
                    break;
                case 'confirmed':
                    data = await purchasesApi.orders.getConfirmed(params);
                    break;
                case 'outstanding':
                    data = await purchasesApi.orders.getOutstanding(params);
                    break;
                default:
                    data = await purchasesApi.orders.getAll(params);
            }
            setOrders(data || []);
        } catch (error) {
            console.error('Failed to fetch orders:', error);
            setOrders([]);
        } finally {
            setLoading(false);
        }
    };

    const handleApplyFilters = (filterValues) => {
        setFilters(filterValues);
    };

    const handleResetFilters = () => {
        setFilters({});
        setSearchTerm('');
    };

    const handleSearch = (value) => {
        setSearchTerm(value);
    };

    const getStatusBadge = (status) => {
        const variants = {
            draft: 'draft',
            confirmed: 'confirmed',
        };
        return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
    };

    const getPaymentStatusBadge = (status) => {
        const variants = {
            unpaid: 'unpaid',
            partial: 'partial',
            paid: 'paid',
        };
        return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
    };

    const columns = [
        { key: 'order_number', label: 'Order #', width: '120px' },
        {
            key: 'supplier',
            label: 'Supplier',
            render: (value) => value?.name || 'N/A'
        },
        {
            key: 'status',
            label: 'Status',
            render: getStatusBadge
        },
        {
            key: 'net_payable',
            label: 'Total (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
        },
        {
            key: 'payment_status',
            label: 'Payment',
            render: getPaymentStatusBadge
        },
        {
            key: 'created_at',
            label: 'Date',
            render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A'
        },
    ];

    const handleViewOrder = async (order) => {
        setSelectedOrder(order);
        setShowDetailModal(true);
        setOrderLoading(true);
        try {
            const detail = await purchasesApi.orders.getById(order.id);
            setSelectedOrder(detail);
            if (detail.status === 'confirmed') {
                fetchPDFs(detail.id);
            }
        } catch (error) {
            console.error('Failed to load order details:', error);
        } finally {
            setOrderLoading(false);
        }
    };

    const handleViewPaymentSummary = async (orderId) => {
        try {
            const data = await purchasesApi.orders.getPaymentSummary(orderId);
            setPaymentSummary(data);
            setShowPaymentSummary(true);
        } catch (error) {
            console.error('Failed to fetch payment summary:', error);
        }
    };

    const handleViewPaymentDetail = (payment) => {
        setSelectedPayment(payment);
        setShowPaymentDetail(true);
    };

    const handlePrintOrder = async (orderId) => {
        try {
            const response = await purchasesApi.orders.print(orderId, false);
            const blob = new Blob([response], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (error) {
            console.error('Failed to print order:', error);
        }
    };

    const handleSavePDF = async (orderId) => {
        setPdfLoading(true);
        try {
            const data = {
                file_name: pdfFileName || selectedOrder?.order_number || 'purchase_order',
            };
            await purchasesApi.orders.savePDF(orderId, data);
            setShowPdfModal(false);
            setPdfFileName('');
            fetchPDFs(orderId);
            alert('PDF saved successfully!');
        } catch (error) {
            console.error('Failed to save PDF:', error);
        } finally {
            setPdfLoading(false);
        }
    };

    const fetchPDFs = async (orderId) => {
        try {
            const data = await purchasesApi.orders.getPDFs(orderId);
            setPdfs(data || []);
        } catch (error) {
            console.error('Failed to fetch PDFs:', error);
            setPdfs([]);
        }
    };

    const handleDeletePDF = async (pdfId) => {
        if (!window.confirm('Are you sure you want to delete this PDF?')) return;
        try {
            await purchasesApi.orders.deletePDF(pdfId);
            fetchPDFs(selectedOrder?.id);
        } catch (error) {
            console.error('Failed to delete PDF:', error);
        }
    };

    const handleAddPayment = async (e) => {
        e.preventDefault();
        setPaymentLoading(true);
        try {
            if (!selectedOrder?.id) {
                throw new Error('No order selected');
            }

            const paymentData = {
                order: parseInt(selectedOrder.id),
                amount: parseFloat(paymentFormData.amount),
                method: paymentFormData.method,
                payment_date: paymentFormData.payment_date,
                note: paymentFormData.note || '',
            };

            console.log('Sending payment data:', paymentData);

            await purchasesApi.payments.create(selectedOrder.id, paymentData);
            setShowAddPaymentModal(false);
            resetPaymentForm();

            // Refresh order details to update payment status
            const detail = await purchasesApi.orders.getById(selectedOrder.id);
            setSelectedOrder(detail);

            // Also refresh the orders list to update the table
            fetchOrders();

            alert('Payment recorded successfully!');
        } catch (error) {
            console.error('Failed to create payment:', error);
            let errorMessage = 'Failed to record payment';

            if (error.response?.data) {
                const errorData = error.response.data;
                if (typeof errorData === 'object') {
                    const messages = Object.entries(errorData)
                        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                        .join('\n');
                    errorMessage = `Validation Error:\n${messages}`;
                } else if (typeof errorData === 'string') {
                    errorMessage = errorData;
                }
            } else if (error.message) {
                errorMessage = error.message;
            }

            alert(errorMessage);
        } finally {
            setPaymentLoading(false);
        }
    };

    const resetPaymentForm = () => {
        setPaymentFormData({
            amount: '',
            method: 'cash',
            payment_date: new Date().toISOString().split('T')[0],
            note: '',
        });
    };

    const handleAddItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [
                ...prev.items,
                { product: '', quantity: 1, unit_price: 0, gst: 0, wht: 0, description: '' }
            ]
        }));
    };

    const handleUpdateItem = (index, field, value) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            )
        }));
    };

    const handleRemoveItem = (index) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    };

    const calculatePreview = () => {
        const items = formData.items.map(item => {
            const product = products.find(p => p.id === parseInt(item.product));
            const gross = (item.quantity || 0) * (item.unit_price || 0);
            const gstAmount = gross * ((item.gst || 0) / 100);
            const whtAmount = gross * ((item.wht || 0) / 100);
            const total = gross + gstAmount - whtAmount;

            return {
                product_name: product?.name || 'Unknown',
                quantity: item.quantity || 0,
                line_total: total,
                rate_missing: false,
                stock_insufficient: false,
            };
        });

        const subtotal = items.reduce((sum, item) => sum + (item.line_total || 0), 0);
        return {
            items,
            totals: {
                subtotal: subtotal.toFixed(2),
                total_cogs: '0.00',
                gross_profit: '0.00',
            },
            warnings: { missing_rate: false, missing_stock: false },
        };
    };

    const handleSubmitOrder = async (e) => {
        e.preventDefault();
        setError('');
        setFormLoading(true);

        try {
            if (!formData.supplier) {
                setError('Please select a supplier.');
                setFormLoading(false);
                return;
            }

            if (formData.items.length === 0) {
                setError('Please add at least one item to the order.');
                setFormLoading(false);
                return;
            }

            const invalidItems = formData.items.some(item => !item.product);
            if (invalidItems) {
                setError('Please select a product for all items.');
                setFormLoading(false);
                return;
            }

            const invalidQuantity = formData.items.some(item => !item.quantity || item.quantity <= 0);
            if (invalidQuantity) {
                setError('Please enter a valid quantity for all items.');
                setFormLoading(false);
                return;
            }

            const invalidPrice = formData.items.some(item => !item.unit_price || item.unit_price <= 0);
            if (invalidPrice) {
                setError('Please enter a valid unit price for all items.');
                setFormLoading(false);
                return;
            }

            const data = {
                supplier_id: parseInt(formData.supplier),
                payment_type: formData.payment_type,
                advance_amount: formData.payment_type === 'advance' ? parseFloat(formData.advance_amount) || 0 : 0,
                description: formData.description || '',
                items: formData.items.map(item => ({
                    product_id: parseInt(item.product),
                    quantity: parseInt(item.quantity) || 0,
                    unit_price: parseFloat(item.unit_price) || 0,
                    gst: parseFloat(item.gst) || 0,
                    wht: parseFloat(item.wht) || 0,
                    description: item.description || '',
                })),
            };

            const result = await purchasesApi.orders.create(data);
            setShowCreateModal(false);
            resetForm();
            fetchOrders();
        } catch (error) {
            console.error('Failed to create order:', error);

            if (error.response?.data) {
                const errorData = error.response.data;
                if (typeof errorData === 'object') {
                    const errorMessages = Object.entries(errorData)
                        .map(([key, value]) => {
                            if (key === 'items') {
                                return `${key}: ${JSON.stringify(value)}`;
                            }
                            return `${key}: ${Array.isArray(value) ? value.join(', ') : value}`;
                        })
                        .join('\n');
                    setError(`Validation Error:\n${errorMessages}`);
                } else {
                    setError(errorData || 'Failed to create order. Please check your input.');
                }
            } else {
                setError(error.message || 'Failed to create order. Please try again.');
            }
        } finally {
            setFormLoading(false);
        }
    };

    const handleConfirmOrder = async (orderId) => {
        if (!window.confirm('Are you sure you want to confirm this order?')) return;

        try {
            await purchasesApi.orders.confirm(orderId);
            fetchOrders();
            if (selectedOrder) {
                const detail = await purchasesApi.orders.getById(orderId);
                setSelectedOrder(detail);
                fetchPDFs(orderId);
            }
        } catch (error) {
            console.error('Failed to confirm order:', error);
        }
    };

    const handleDeleteOrder = async (orderId) => {
        if (!window.confirm('Are you sure you want to delete this draft order?')) return;

        try {
            await purchasesApi.orders.delete(orderId);
            fetchOrders();
            setShowDetailModal(false);
        } catch (error) {
            console.error('Failed to delete order:', error);
        }
    };

    const resetForm = () => {
        setFormData({
            supplier: '',
            payment_type: 'after_delivery',
            advance_amount: '',
            description: '',
            items: [],
        });
        setError('');
    };

    const filterConfig = [
        { name: 'supplier_name', label: 'Supplier Name', type: 'text' },
        { name: 'supplier_code', label: 'Supplier Code', type: 'text' },
        { name: 'order_number', label: 'Order Number', type: 'text' },
        { name: 'date_from', label: 'Date From', type: 'date' },
        { name: 'date_to', label: 'Date To', type: 'date' },
        {
            name: 'payment_status',
            label: 'Payment Status',
            type: 'select',
            options: [
                { value: 'unpaid', label: 'Unpaid' },
                { value: 'partial', label: 'Partial' },
                { value: 'paid', label: 'Paid' },
            ],
        },
        {
            name: 'payment_type',
            label: 'Payment Type',
            type: 'select',
            options: [
                { value: 'advance', label: 'Advance' },
                { value: 'after_delivery', label: 'After Delivery' },
            ],
        },
        { name: 'min_amount', label: 'Min Amount', type: 'number' },
        { name: 'max_amount', label: 'Max Amount', type: 'number' },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">Purchase Orders</h1>
                    <p className="text-neutral-500 mt-1">Create and manage purchase orders</p>
                </div>
                {isAdmin && (
                    <Button
                        onClick={() => {
                            resetForm();
                            setShowCreateModal(true);
                        }}
                        icon={({ className }) => (
                            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        )}
                    >
                        Create Order
                    </Button>
                )}
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <div className="flex-1">
                        <SearchBar
                            onSearch={handleSearch}
                            placeholder="Search by order number..."
                            className="w-full"
                        />
                    </div>
                    <Button
                        variant="secondary"
                        onClick={() => setShowFilters(!showFilters)}
                        icon={({ className }) => (
                            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                        )}
                    >
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </Button>
                    {(Object.keys(filters).length > 0 || searchTerm) && (
                        <Button variant="secondary" onClick={handleResetFilters}>
                            Clear All
                        </Button>
                    )}
                </div>

                {showFilters && (
                    <FilterBar
                        filters={filterConfig}
                        onApply={handleApplyFilters}
                        onReset={handleResetFilters}
                    />
                )}

                <Tabs
                    tabs={tabs}
                    activeTab={activeTab}
                    onChange={setActiveTab}
                />
            </div>

            <Table
                columns={columns}
                data={orders}
                onRowClick={handleViewOrder}
            />

            {/* Create Order Modal */}
            <Modal
                isOpen={showCreateModal}
                onClose={() => {
                    setShowCreateModal(false);
                    resetForm();
                }}
                title="Create Purchase Order"
                size="xl"
            >
                <form onSubmit={handleSubmitOrder} className="space-y-6">
                    <div className="space-y-4">
                        <Select
                            label="Supplier"
                            value={formData.supplier}
                            onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                            options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                            placeholder="Select supplier"
                            required
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <Select
                                label="Payment Type"
                                value={formData.payment_type}
                                onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })}
                                options={[
                                    { value: 'advance', label: 'Advance' },
                                    { value: 'after_delivery', label: 'After Delivery' },
                                ]}
                                required
                            />

                            {formData.payment_type === 'advance' && (
                                <Input
                                    label="Advance Amount (PKR)"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={formData.advance_amount}
                                    onChange={(e) => setFormData({ ...formData, advance_amount: e.target.value })}
                                    placeholder="Enter advance amount"
                                    required
                                />
                            )}
                        </div>

                        <Input
                            label="Description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Order description (optional)"
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-neutral-900">Line Items</h3>
                            <Button size="sm" onClick={handleAddItem}>
                                Add Item
                            </Button>
                        </div>

                        <div className="space-y-3 max-h-[500px] overflow-y-auto">
                            {formData.items.length === 0 ? (
                                <p className="text-center text-neutral-500 py-8">No items added yet. Click "Add Item" to start.</p>
                            ) : (
                                formData.items.map((item, index) => (
                                    <LineItemRow
                                        key={index}
                                        index={index}
                                        item={item}
                                        products={products}
                                        onUpdate={handleUpdateItem}
                                        onRemove={handleRemoveItem}
                                        canEdit={true}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-error-50 border border-error-200 rounded-lg">
                            <p className="text-sm text-error-600 whitespace-pre-wrap">{error}</p>
                        </div>
                    )}

                    {formData.items.length > 0 && (
                        <DraftPreview {...calculatePreview()} />
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                setShowCreateModal(false);
                                resetForm();
                            }}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={formLoading}>
                            Create Draft
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Order Detail Modal */}
            <Modal
                isOpen={showDetailModal}
                onClose={() => {
                    setShowDetailModal(false);
                    setSelectedOrder(null);
                    setPdfs([]);
                }}
                title="Order Details"
                size="lg"
            >
                {orderLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <LoadingSpinner />
                    </div>
                ) : selectedOrder && (
                    <div className="space-y-6 max-h-[70vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-neutral-500">Order Number</p>
                                <p className="font-medium">{selectedOrder.order_number}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Status</p>
                                {getStatusBadge(selectedOrder.status)}
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Supplier</p>
                                <p className="font-medium">{selectedOrder.supplier?.name || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Payment Type</p>
                                <p className="font-medium">{selectedOrder.payment_type || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Gross Amount (PKR)</p>
                                <p className="font-medium">
                                    {typeof selectedOrder.gross_amount === 'string'
                                        ? parseFloat(selectedOrder.gross_amount).toFixed(2)
                                        : '0.00'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Net Payable (PKR)</p>
                                <p className="font-medium text-primary-600">
                                    {typeof selectedOrder.net_payable === 'string'
                                        ? parseFloat(selectedOrder.net_payable).toFixed(2)
                                        : '0.00'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Payment Status</p>
                                {getPaymentStatusBadge(selectedOrder.payment_status)}
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Total Paid (PKR)</p>
                                <p className="font-medium text-success-600">
                                    {typeof selectedOrder.total_paid === 'string'
                                        ? parseFloat(selectedOrder.total_paid).toFixed(2)
                                        : '0.00'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Payable Outstanding (PKR)</p>
                                <p className="font-medium text-error-600">
                                    {typeof selectedOrder.payable_outstanding === 'string'
                                        ? parseFloat(selectedOrder.payable_outstanding).toFixed(2)
                                        : '0.00'}
                                </p>
                            </div>
                            {selectedOrder.advance_amount && parseFloat(selectedOrder.advance_amount) > 0 && (
                                <div>
                                    <p className="text-sm text-neutral-500">Advance Amount (PKR)</p>
                                    <p className="font-medium">
                                        {typeof selectedOrder.advance_amount === 'string'
                                            ? parseFloat(selectedOrder.advance_amount).toFixed(2)
                                            : '0.00'}
                                    </p>
                                </div>
                            )}
                            {selectedOrder.gst_total && parseFloat(selectedOrder.gst_total) > 0 && (
                                <div>
                                    <p className="text-sm text-neutral-500">GST Total (PKR)</p>
                                    <p className="font-medium">
                                        {typeof selectedOrder.gst_total === 'string'
                                            ? parseFloat(selectedOrder.gst_total).toFixed(2)
                                            : '0.00'}
                                    </p>
                                </div>
                            )}
                            {selectedOrder.wht_total && parseFloat(selectedOrder.wht_total) > 0 && (
                                <div>
                                    <p className="text-sm text-neutral-500">WHT Total (PKR)</p>
                                    <p className="font-medium">
                                        {typeof selectedOrder.wht_total === 'string'
                                            ? parseFloat(selectedOrder.wht_total).toFixed(2)
                                            : '0.00'}
                                    </p>
                                </div>
                            )}
                            {selectedOrder.confirmed_at && (
                                <div>
                                    <p className="text-sm text-neutral-500">Confirmed</p>
                                    <p className="font-medium">{new Date(selectedOrder.confirmed_at).toLocaleString()}</p>
                                </div>
                            )}
                            {selectedOrder.description && (
                                <div className="col-span-2">
                                    <p className="text-sm text-neutral-500">Description</p>
                                    <p className="font-medium">{selectedOrder.description}</p>
                                </div>
                            )}
                        </div>

                        {selectedOrder.items && selectedOrder.items.length > 0 && (
                            <div>
                                <h3 className="font-semibold text-neutral-900 mb-3">Items</h3>
                                <div className="space-y-2">
                                    {selectedOrder.items.map((item, index) => (
                                        <div key={index} className="flex justify-between items-center p-3 bg-neutral-50 rounded-lg">
                                            <div>
                                                <p className="font-medium">{item.product_name}</p>
                                                <p className="text-sm text-neutral-500">
                                                    {item.quantity} × {typeof item.unit_price === 'string'
                                                        ? parseFloat(item.unit_price).toFixed(2)
                                                        : '0.00'}
                                                </p>
                                                <p className="text-xs text-neutral-400">
                                                    Remaining: {item.remaining_quantity} | Returned: {item.returned_quantity}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-medium">
                                                    {typeof item.total_price === 'string'
                                                        ? parseFloat(item.total_price).toFixed(2)
                                                        : '0.00'}
                                                </p>
                                                <p className="text-xs text-neutral-500">
                                                    GST: {typeof item.gst_amount === 'string'
                                                        ? parseFloat(item.gst_amount).toFixed(2)
                                                        : '0.00'} |
                                                    WHT: {typeof item.wht_amount === 'string'
                                                        ? parseFloat(item.wht_amount).toFixed(2)
                                                        : '0.00'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Action Buttons for Confirmed Orders */}
                        {selectedOrder.status === 'confirmed' && (
                            <div className="flex flex-wrap gap-3 pt-4 border-t border-neutral-200">
                                <Button
                                    variant="secondary"
                                    onClick={() => handleViewPaymentSummary(selectedOrder.id)}
                                >
                                    View Payment Summary
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => handlePrintOrder(selectedOrder.id)}
                                >
                                    Print Order
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setPdfFileName(selectedOrder.order_number);
                                        setShowPdfModal(true);
                                    }}
                                >
                                    Save PDF
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={() => {
                                        resetPaymentForm();
                                        setShowAddPaymentModal(true);
                                    }}
                                >
                                    Add Payment
                                </Button>
                            </div>
                        )}

                        {/* Draft Order Actions */}
                        {selectedOrder.status === 'draft' && isAdmin && (
                            <div className="flex gap-3 pt-4 border-t border-neutral-200">
                                <Button
                                    variant="success"
                                    onClick={() => handleConfirmOrder(selectedOrder.id)}
                                >
                                    Confirm Order
                                </Button>
                                <Button
                                    variant="danger"
                                    onClick={() => handleDeleteOrder(selectedOrder.id)}
                                >
                                    Delete Draft
                                </Button>
                            </div>
                        )}

                        {/* Saved PDFs Section */}
                        {selectedOrder.status === 'confirmed' && pdfs.length > 0 && (
                            <div>
                                <h3 className="font-semibold text-neutral-900 mb-3">Saved PDFs</h3>
                                <div className="space-y-2">
                                    {pdfs.map((pdf) => (
                                        <div key={pdf.id} className="flex justify-between items-center p-3 bg-neutral-50 rounded-lg">
                                            <div>
                                                <p className="font-medium">{pdf.file_name}</p>
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
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Payment Summary Modal */}
            <Modal
                isOpen={showPaymentSummary}
                onClose={() => {
                    setShowPaymentSummary(false);
                    setPaymentSummary(null);
                }}
                title="Payment Summary"
                size="lg"
            >
                {paymentSummary && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <p className="text-sm text-neutral-500">Order #</p>
                                <p className="font-medium">{paymentSummary.order_number}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Supplier</p>
                                <p className="font-medium">{paymentSummary.supplier_name || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Net Payable</p>
                                <p className="font-medium text-primary-600">
                                    {typeof paymentSummary.net_payable === 'string'
                                        ? parseFloat(paymentSummary.net_payable).toFixed(2)
                                        : '0.00'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Payment Status</p>
                                <Badge variant={paymentSummary.payment_status === 'paid' ? 'paid' :
                                    paymentSummary.payment_status === 'partial' ? 'partial' : 'unpaid'}>
                                    {paymentSummary.payment_status_display || paymentSummary.payment_status || 'N/A'}
                                </Badge>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Total Paid</p>
                                <p className="font-medium text-success-600">
                                    {typeof paymentSummary.total_paid === 'string'
                                        ? parseFloat(paymentSummary.total_paid).toFixed(2)
                                        : '0.00'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Outstanding</p>
                                <p className="font-medium text-error-600">
                                    {typeof paymentSummary.payable_outstanding === 'string'
                                        ? parseFloat(paymentSummary.payable_outstanding).toFixed(2)
                                        : '0.00'}
                                </p>
                            </div>
                        </div>

                        {paymentSummary.payments && paymentSummary.payments.length > 0 && (
                            <div>
                                <h3 className="font-semibold text-neutral-900 mb-3">Payment History</h3>
                                <div className="space-y-2">
                                    {paymentSummary.payments.map((payment) => (
                                        <div
                                            key={payment.id}
                                            className="flex justify-between items-center p-3 bg-neutral-50 rounded-lg cursor-pointer hover:bg-neutral-100 transition-colors"
                                            onClick={() => handleViewPaymentDetail(payment)}
                                        >
                                            <div>
                                                <p className="font-medium">{payment.reference_number}</p>
                                                <p className="text-sm text-neutral-500">{payment.method_display}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-medium text-success-600">
                                                    {typeof payment.amount === 'string'
                                                        ? parseFloat(payment.amount).toFixed(2)
                                                        : '0.00'}
                                                </p>
                                                <p className="text-xs text-neutral-500">{new Date(payment.payment_date).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Payment Detail Modal */}
            <Modal
                isOpen={showPaymentDetail}
                onClose={() => {
                    setShowPaymentDetail(false);
                    setSelectedPayment(null);
                }}
                title="Payment Details"
                size="md"
            >
                {selectedPayment && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-neutral-500">Reference Number</p>
                                <p className="font-medium">{selectedPayment.reference_number}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Amount</p>
                                <p className="font-medium text-success-600">
                                    {typeof selectedPayment.amount === 'string'
                                        ? parseFloat(selectedPayment.amount).toFixed(2)
                                        : '0.00'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Method</p>
                                <p className="font-medium">
                                    <Badge>{selectedPayment.method_display || selectedPayment.method}</Badge>
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Payment Date</p>
                                <p className="font-medium">{new Date(selectedPayment.payment_date).toLocaleDateString()}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Created By</p>
                                <p className="font-medium">{selectedPayment.created_by || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Created At</p>
                                <p className="font-medium">{new Date(selectedPayment.created_at).toLocaleString()}</p>
                            </div>
                            {selectedPayment.note && (
                                <div className="col-span-2">
                                    <p className="text-sm text-neutral-500">Note</p>
                                    <p className="font-medium">{selectedPayment.note}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* Save PDF Modal */}
            <Modal
                isOpen={showPdfModal}
                onClose={() => {
                    setShowPdfModal(false);
                    setPdfFileName('');
                }}
                title="Save PDF"
            >
                <div className="space-y-4">
                    <Input
                        label="File Name"
                        value={pdfFileName}
                        onChange={(e) => setPdfFileName(e.target.value)}
                        placeholder="Enter file name"
                        required
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                setShowPdfModal(false);
                                setPdfFileName('');
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => handleSavePDF(selectedOrder?.id)}
                            loading={pdfLoading}
                        >
                            Save
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Add Payment Modal */}
            <Modal
                isOpen={showAddPaymentModal}
                onClose={() => {
                    setShowAddPaymentModal(false);
                    resetPaymentForm();
                }}
                title="Add Payment"
            >
                <form onSubmit={handleAddPayment} className="space-y-4">
                    <Input
                        label="Amount (PKR)"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={paymentFormData.amount}
                        onChange={(e) => setPaymentFormData({ ...paymentFormData, amount: e.target.value })}
                        placeholder="Enter amount"
                        required
                    />

                    <Select
                        label="Payment Method"
                        value={paymentFormData.method}
                        onChange={(e) => setPaymentFormData({ ...paymentFormData, method: e.target.value })}
                        options={[
                            { value: 'cash', label: 'Cash' },
                            { value: 'jazzcash', label: 'JazzCash' },
                            { value: 'easypaisa', label: 'Easypaisa' },
                            { value: 'bank', label: 'Bank Transfer' },
                        ]}
                        required
                    />

                    <Input
                        label="Payment Date"
                        type="date"
                        value={paymentFormData.payment_date}
                        onChange={(e) => setPaymentFormData({ ...paymentFormData, payment_date: e.target.value })}
                        required
                    />

                    <Input
                        label="Note"
                        value={paymentFormData.note}
                        onChange={(e) => setPaymentFormData({ ...paymentFormData, note: e.target.value })}
                        placeholder="Payment note (optional)"
                    />

                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                setShowAddPaymentModal(false);
                                resetPaymentForm();
                            }}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={paymentLoading}>
                            Record Payment
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default PurchaseOrdersPage;