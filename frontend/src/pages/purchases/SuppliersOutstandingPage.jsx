import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSuppliersOutstanding } from '../../hooks/usePurchases';
import Table from '../../components/ui/Table';
import SearchBar from '../../components/ui/SearchBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import { purchasesApi } from '../../services/purchasesApi';

const SuppliersOutstandingPage = () => {
    const { data, loading, filters, setFilters, refetch } = useSuppliersOutstanding();
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [outstandingOrders, setOutstandingOrders] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);

    const handleViewDetails = async (supplier) => {
        setSelectedSupplier(supplier);
        setShowDetailModal(true);
        setDetailLoading(true);
        try {
            const orders = await purchasesApi.suppliers.getOutstandingOrders(supplier.id);
            setOutstandingOrders(orders);
        } catch (error) {
            console.error('Failed to load outstanding orders:', error);
        } finally {
            setDetailLoading(false);
        }
    };

    const columns = [
        { key: 'code', label: 'Code', width: '120px' },
        { key: 'name', label: 'Name' },
        { key: 'mobile', label: 'Mobile' },
        {
            key: 'outstanding',
            label: 'Outstanding',
            render: (value) => (
                <span className="font-semibold text-error-600">
                    ${parseFloat(value || 0).toFixed(2)}
                </span>
            )
        },
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
            <div>
                <h1 className="text-3xl font-bold text-neutral-900">Suppliers Outstanding</h1>
                <p className="text-neutral-500 mt-1">View suppliers with outstanding balances</p>
            </div>

            <div className="flex gap-4 flex-wrap">
                <SearchBar
                    onSearch={(value) => setFilters({ ...filters, search: value })}
                    placeholder="Search suppliers..."
                    className="flex-1 min-w-[200px]"
                />

                <select
                    value={filters.payment_status || ''}
                    onChange={(e) => setFilters({ ...filters, payment_status: e.target.value })}
                    className="px-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                >
                    <option value="">All Status</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partial</option>
                </select>

                <input
                    type="number"
                    placeholder="Min Outstanding"
                    value={filters.min_outstanding || ''}
                    onChange={(e) => setFilters({ ...filters, min_outstanding: e.target.value })}
                    className="px-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all w-40"
                />

                <input
                    type="number"
                    placeholder="Max Outstanding"
                    value={filters.max_outstanding || ''}
                    onChange={(e) => setFilters({ ...filters, max_outstanding: e.target.value })}
                    className="px-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all w-40"
                />

                <button
                    onClick={() => refetch()}
                    className="px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
                >
                    Apply Filters
                </button>
            </div>

            <Table
                columns={columns}
                data={data}
                onRowClick={handleViewDetails}
            />

            <Modal
                isOpen={showDetailModal}
                onClose={() => {
                    setShowDetailModal(false);
                    setSelectedSupplier(null);
                    setOutstandingOrders([]);
                }}
                title="Outstanding Orders"
                size="lg"
            >
                {detailLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <LoadingSpinner />
                    </div>
                ) : (
                    <>
                        {selectedSupplier && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4 p-4 bg-neutral-50 rounded-lg">
                                    <div>
                                        <p className="text-sm text-neutral-500">Supplier</p>
                                        <p className="font-medium">{selectedSupplier.name}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-neutral-500">Code</p>
                                        <p className="font-medium">{selectedSupplier.code}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-neutral-500">Total Outstanding</p>
                                        <p className="text-xl font-bold text-error-600">
                                            ${parseFloat(selectedSupplier.outstanding || 0).toFixed(2)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-neutral-500">Payment Status</p>
                                        <Badge variant={selectedSupplier.outstanding > 0 ? 'unpaid' : 'paid'}>
                                            {selectedSupplier.outstanding > 0 ? 'Outstanding' : 'Settled'}
                                        </Badge>
                                    </div>
                                </div>

                                {outstandingOrders.length > 0 ? (
                                    <div className="space-y-3">
                                        <h3 className="font-semibold text-neutral-900">Bill-wise Breakdown</h3>
                                        {outstandingOrders.map((order) => (
                                            <Card key={order.id} className="p-4">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="font-medium">{order.order_number}</p>
                                                        <p className="text-sm text-neutral-500">
                                                            {new Date(order.created_at).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-semibold text-error-600">
                                                            ${parseFloat(order.outstanding_amount || 0).toFixed(2)}
                                                        </p>
                                                        <Badge variant={order.payment_status === 'paid' ? 'paid' : 'unpaid'}>
                                                            {order.payment_status || 'N/A'}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-neutral-500 py-4">No outstanding orders</p>
                                )}
                            </div>
                        )}
                    </>
                )}
            </Modal>
        </div>
    );
};

export default SuppliersOutstandingPage;