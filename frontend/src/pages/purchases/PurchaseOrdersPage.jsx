import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Tabs from '../../components/ui/Tabs';
import SearchBar from '../../components/ui/SearchBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import FilterBar from '../../components/ui/FilterBar';
import PurchaseOrderFormModal from '../../components/purchases/PurchaseOrderFormModal';
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

    const tabs = [
        { value: 'all', label: 'All Orders' },
        { value: 'drafts', label: 'Drafts' },
        { value: 'confirmed', label: 'Confirmed' },
        { value: 'outstanding', label: 'Outstanding' },
    ];

    const searchProducts = async (query) => {
        const res = await purchasesApi.products.getAll({ search: query, page_size: 25 });
        const results = res?.results ?? res ?? [];
        return results.map(p => ({ value: p.id, label: `${p.code} - ${p.name}` }));
    };

    const searchSuppliers = async (query) => {
        const res = await purchasesApi.suppliers.getAll({ search: query });
        const results = res?.results ?? res ?? [];
        return results.map(s => ({ value: s.id, label: `${s.name} (${s.code})` }));
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

    const handleCreateOrder = async (payload) => {
        await purchasesApi.orders.create(payload);
        setShowCreateModal(false);
        fetchOrders();
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
                        onClick={() => setShowCreateModal(true)}
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

            <PurchaseOrderFormModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSubmit={handleCreateOrder}
                onSearchProducts={searchProducts}
                onSearchSuppliers={searchSuppliers}
                title="Create Purchase Order"
                submitLabel="Create Draft"
            />
        </div>
    );
};

export default PurchaseOrdersPage;