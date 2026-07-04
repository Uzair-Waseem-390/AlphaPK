import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { purchaseOrdersApi } from '../../utils/api';
import PurchaseOrderCard from '../../components/purchases/purchase-orders/PurchaseOrderCard';
import PurchaseOrderFilters from '../../components/purchases/purchase-orders/PurchaseOrderFilters';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const PurchaseOrders = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [filteredOrders, setFilteredOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({});

    useEffect(() => {
        fetchOrders();
    }, []);

    useEffect(() => {
        let filtered = [...orders];

        if (searchTerm) {
            filtered = filtered.filter(o =>
                o.bill_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                o.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (filters.status) {
            filtered = filtered.filter(o => o.status === filters.status);
        }

        if (filters.paymentStatus) {
            filtered = filtered.filter(o => o.payment_status === filters.paymentStatus);
        }

        if (filters.minAmount) {
            filtered = filtered.filter(o => parseFloat(o.grand_total || 0) >= parseFloat(filters.minAmount));
        }

        if (filters.maxAmount) {
            filtered = filtered.filter(o => parseFloat(o.grand_total || 0) <= parseFloat(filters.maxAmount));
        }

        setFilteredOrders(filtered);
    }, [orders, searchTerm, filters]);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const data = await purchaseOrdersApi.getAll();
            setOrders(data || []);
            setFilteredOrders(data || []);
        } catch (error) {
            console.error('Failed to fetch orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async (id) => {
        if (!window.confirm('Confirm this purchase order?')) return;
        try {
            await purchaseOrdersApi.confirm(id);
            await fetchOrders();
        } catch (error) {
            console.error('Failed to confirm order:', error);
            alert(error.response?.data?.detail || 'Failed to confirm order');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this purchase order?')) return;
        try {
            await purchaseOrdersApi.delete(id);
            await fetchOrders();
        } catch (error) {
            console.error('Failed to delete order:', error);
            alert(error.response?.data?.detail || 'Failed to delete order');
        }
    };

    const handleCreateOrder = () => {
        navigate('/purchases/orders/create');
    };

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
                    <p className="text-neutral-500 mt-1">Manage all purchase orders</p>
                </div>
                <Button onClick={handleCreateOrder}>
                    Create Order
                </Button>
            </div>

            <PurchaseOrderFilters
                onSearch={setSearchTerm}
                onFilter={setFilters}
            />

            <AnimatePresence mode="popLayout">
                <div className="grid grid-cols-1 gap-4">
                    {filteredOrders.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center py-12"
                        >
                            <p className="text-neutral-500">No purchase orders found</p>
                        </motion.div>
                    ) : (
                        filteredOrders.map((order) => (
                            <PurchaseOrderCard
                                key={order.id}
                                order={order}
                                onConfirm={handleConfirm}
                                onDelete={handleDelete}
                            />
                        ))
                    )}
                </div>
            </AnimatePresence>
        </div>
    );
};

export default PurchaseOrders;