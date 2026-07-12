import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { purchasesApi } from '../../services/purchasesApi';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import OrderStatusBadge from '../../components/purchases/OrderStatusBadge';
import OrderPaymentStatusBadge from '../../components/purchases/OrderPaymentStatusBadge';

const SupplierDetailPage = () => {
    const { id } = useParams();

    const [supplier, setSupplier] = useState(null);
    const [payableSummary, setPayableSummary] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [id]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [supplierData, summaryData] = await Promise.all([
                purchasesApi.suppliers.getById(id),
                purchasesApi.suppliers.getPayableSummary(id),
            ]);

            setSupplier(supplierData);
            setPayableSummary(summaryData);
        } catch (error) {
            console.error('Failed to fetch supplier details:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchOrdersPage = (params) => {
        if (!supplier?.code) {
            return Promise.resolve({ results: [], count: 0, total_pages: 1, current_page: 1, page_size: 25 });
        }
        return purchasesApi.orders.getAll({ ...params, supplier_code: supplier.code });
    };

    const { data: orders, meta, page, setPage, loading: ordersLoading } = usePaginatedList(fetchOrdersPage, {}, 25, [supplier?.code]);

    const columns = [
        { key: 'order_number', label: 'Order #', width: '120px' },
        {
            key: 'net_payable',
            label: 'Net Payable (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
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
            key: 'payment_status',
            label: 'Payment Status',
            render: (value) => <OrderPaymentStatusBadge status={value} />
        },
        {
            key: 'status',
            label: 'Order Status',
            render: (value) => <OrderStatusBadge status={value} />
        },
        {
            key: 'confirmed_at',
            label: 'Confirmed',
            render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A'
        },
        {
            key: 'id',
            label: 'Actions',
            width: '100px',
            render: (_, row) => (
                <Link
                    to={`/purchases/orders/${row.id}`}
                    className="text-primary-600 hover:text-primary-700 text-sm"
                >
                    View
                </Link>
            ),
        },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!supplier) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Supplier Not Found</h2>
                <Link to="/purchases/suppliers" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
                    ← Back to Suppliers
                </Link>
            </div>
        );
    }

    const activeOrders = orders.filter(o => o.status !== 'draft');
    const draftOrders = orders.filter(o => o.status === 'draft');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link to="/purchases/suppliers" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Suppliers
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">{supplier.name}</h1>
                    <p className="text-neutral-500">Code: {supplier.code}</p>
                </div>
                <Link to="/purchases/suppliers">
                    <Button variant="secondary">
                        ← Back to Suppliers
                    </Button>
                </Link>
            </div>

            {/* Supplier Info */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Supplier Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-sm text-neutral-500">Name</p>
                        <p className="font-medium">{supplier.name}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Code</p>
                        <p className="font-medium">{supplier.code}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Address</p>
                        <p className="font-medium">{supplier.address || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Mobile</p>
                        <p className="font-medium">{supplier.mobile || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Created</p>
                        <p className="font-medium">{new Date(supplier.created_at).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral-500">Status</p>
                        <Badge variant={supplier.is_deleted ? 'error' : 'success'}>
                            {supplier.is_deleted ? 'Deleted' : 'Active'}
                        </Badge>
                    </div>
                </div>
            </Card>

            {/* Payable Summary */}
            {payableSummary && Object.keys(payableSummary).length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Total Net Payable</p>
                        <p className="text-xl font-bold text-neutral-900">
                            {typeof payableSummary.total_net_payable === 'string'
                                ? parseFloat(payableSummary.total_net_payable).toFixed(2)
                                : '0.00'}
                        </p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Total Paid</p>
                        <p className="text-xl font-bold text-success-600">
                            {typeof payableSummary.total_paid === 'string'
                                ? parseFloat(payableSummary.total_paid).toFixed(2)
                                : '0.00'}
                        </p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Outstanding</p>
                        <p className="text-xl font-bold text-error-600">
                            {typeof payableSummary.total_payable_outstanding === 'string'
                                ? parseFloat(payableSummary.total_payable_outstanding).toFixed(2)
                                : '0.00'}
                        </p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-sm text-neutral-500">Payment Status</p>
                        <Badge
                            variant={parseFloat(payableSummary.total_payable_outstanding || 0) > 0 ? 'unpaid' : 'paid'}
                        >
                            {parseFloat(payableSummary.total_payable_outstanding || 0) > 0 ? 'Outstanding' : 'Settled'}
                        </Badge>
                    </Card>
                </div>
            )}

            {/* Order History */}
            <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Order History</h3>
                {activeOrders.length === 0 ? (
                    <p className="text-center text-neutral-500 py-4">No confirmed orders for this supplier</p>
                ) : (
                    <Table
                        columns={columns}
                        data={activeOrders}
                    />
                )}
            </Card>

            {/* Draft Orders */}
            {draftOrders.length > 0 && (
                <Card className="p-6">
                    <h3 className="font-semibold text-neutral-900 mb-3">Draft Orders</h3>
                    <Table
                        columns={columns}
                        data={draftOrders}
                    />
                </Card>
            )}

            {meta.totalPages > 1 && (
                <Pagination
                    currentPage={meta.currentPage}
                    totalPages={meta.totalPages}
                    onPageChange={setPage}
                />
            )}
        </div>
    );
};

export default SupplierDetailPage;
