import { useState, useEffect } from 'react';
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
import OrderStatusBadge from '../../components/purchases/OrderStatusBadge';
import OrderPaymentStatusBadge from '../../components/purchases/OrderPaymentStatusBadge';
import Pagination from '../../components/ui/Pagination';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useNavigate } from 'react-router-dom';

const PurchaseOrdersPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('all');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [error, setError] = useState('');

    const fetchOrdersPage = (params) => {
        const p = { ...params };
        if (searchTerm) p.order_number = searchTerm;
        switch (activeTab) {
            case 'drafts': return purchasesApi.orders.getDrafts(p);
            case 'confirmed': return purchasesApi.orders.getConfirmed(p);
            case 'outstanding': return purchasesApi.orders.getOutstanding(p);
            default: return purchasesApi.orders.getAll(p);
        }
    };

    const {
        data: orders, meta, page, setPage, loading,
        filters, setFilters, refetch: fetchOrders,
    } = usePaginatedList(fetchOrdersPage, {}, 25, [activeTab, searchTerm]);

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

    const loadInitialData = async () => {
        try {
            // page_size override — dropdown needs every product, not just one page.
            const [productsRes, suppliersRes] = await Promise.all([
                purchasesApi.products.getAll({ page_size: 500 }),
                purchasesApi.suppliers.getAll(),
            ]);
            setProducts(productsRes.results || productsRes || []);
            setSuppliers(suppliersRes || []);
        } catch (error) {
            console.error('Failed to load initial data:', error);
        }
    };

    const handleApplyFilters = (filterValues) => {
        setFilters(filterValues);
    };

    const handleResetFilters = () => {
        setFilters({});
        setSearchTerm('');
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setPage(1);
    };

    const handleSearch = (value) => {
        setSearchTerm(value);
        setPage(1);
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
            render: (value) => <OrderStatusBadge status={value} />
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
            render: (value) => <OrderPaymentStatusBadge status={value} />
        },
        {
            key: 'payable_outstanding',
            label: 'Outstanding (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
        },
        {
            key: 'created_at',
            label: 'Date',
            render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A'
        },
    ];

    const handleViewOrder = (order) => {
        navigate(`/purchases/orders/${order.id}`);
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
                    onChange={handleTabChange}
                />
            </div>

            <Table
                columns={columns}
                data={orders}
                onRowClick={handleViewOrder}
            />

            {meta.totalPages > 1 && (
                <Pagination
                    currentPage={meta.currentPage}
                    totalPages={meta.totalPages}
                    onPageChange={setPage}
                />
            )}

            {orders.length === 0 && (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">📦</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Orders Found</h3>
                    <p className="text-sm text-neutral-500 mt-1">Try adjusting your search or filters</p>
                </div>
            )}

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
        </div>
    );
};

export default PurchaseOrdersPage;