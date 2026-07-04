import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Card from '../../common/Card';
import Button from '../../common/Button';

const PurchaseOrderCard = ({ order, onConfirm, onDelete }) => {
    const navigate = useNavigate();

    const statusColors = {
        draft: 'bg-yellow-100 text-yellow-700',
        confirmed: 'bg-green-100 text-green-700',
        partial: 'bg-blue-100 text-blue-700',
        returned: 'bg-red-100 text-red-700',
    };

    const paymentColors = {
        unpaid: 'bg-red-100 text-red-700',
        partial: 'bg-yellow-100 text-yellow-700',
        paid: 'bg-green-100 text-green-700',
    };

    const handleView = (e) => {
        e.stopPropagation();
        navigate(`/purchases/orders/${order.id}`);
    };

    const handleCardClick = () => {
        navigate(`/purchases/orders/${order.id}`);
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
        >
            <Card
                className="relative overflow-hidden group cursor-pointer hover:shadow-lg transition-shadow"
                onClick={handleCardClick}
            >
                <div className="flex flex-col gap-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-semibold text-neutral-900">{order.bill_number || 'N/A'}</h3>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[order.status] || 'bg-gray-100 text-gray-700'}`}>
                                {order.status || 'Unknown'}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${paymentColors[order.payment_status] || 'bg-gray-100 text-gray-700'}`}>
                                {order.payment_status_display || order.payment_status || 'Unknown'}
                            </span>
                        </div>

                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {order.status === 'draft' && (
                                <Button
                                    size="sm"
                                    variant="success"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onConfirm) onConfirm(order.id);
                                    }}
                                >
                                    Confirm
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={handleView}
                            >
                                View
                            </Button>
                            {order.status === 'draft' && (
                                <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onDelete) onDelete(order.id);
                                    }}
                                >
                                    Delete
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                            <p className="text-xs text-neutral-500">Customer</p>
                            <p className="text-sm font-medium text-neutral-900 truncate">
                                {order.customer?.name || 'N/A'}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-neutral-500">Amount</p>
                            <p className="text-sm font-semibold text-neutral-900">
                                ${parseFloat(order.grand_total || 0).toFixed(2)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-neutral-500">Outstanding</p>
                            <p className="text-sm font-semibold text-error-600">
                                ${parseFloat(order.credit_outstanding || 0).toFixed(2)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-neutral-500">Date</p>
                            <p className="text-sm text-neutral-900">
                                {order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A'}
                            </p>
                        </div>
                    </div>
                </div>
            </Card>
        </motion.div>
    );
};

export default PurchaseOrderCard;