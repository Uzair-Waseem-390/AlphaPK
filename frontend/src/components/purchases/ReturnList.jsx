import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';

const ReturnList = ({ returns, onAccept, isAdmin }) => {
    if (!returns || returns.length === 0) {
        return (
            <div className="text-center py-4 text-neutral-500">
                No returns for this order
            </div>
        );
    }

    const getStatusBadge = (status) => {
        const variants = {
            pending: 'pending',
            accepted: 'accepted',
        };
        return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
    };

    return (
        <div className="space-y-3">
            {returns.map((returnItem) => (
                <motion.div
                    key={returnItem.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors"
                >
                    <div className="flex justify-between items-start">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                                <p className="font-medium">{returnItem.reference_number}</p>
                                {getStatusBadge(returnItem.status)}
                            </div>
                            <p className="text-sm text-neutral-500">
                                Created: {returnItem.created_at ? new Date(returnItem.created_at).toLocaleString() : 'N/A'}
                            </p>
                            {returnItem.note && (
                                <p className="text-sm text-neutral-600 mt-1">{returnItem.note}</p>
                            )}
                            {returnItem.items && returnItem.items.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-sm text-neutral-500">Returned Items:</p>
                                    <div className="mt-1 space-y-1">
                                        {returnItem.items.map((item, idx) => (
                                            <div key={item.id || idx} className="text-sm flex justify-between items-center bg-white p-2 rounded-lg">
                                                <span className="text-neutral-700">{item.product_name}</span>
                                                <span className="text-neutral-600">× {item.quantity}</span>
                                                <span className="font-medium text-primary-600">
                                                    {item.total_amount ? parseFloat(item.total_amount).toFixed(2) : '0.00'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {returnItem.total_return_amount && (
                                <div className="mt-2 pt-2 border-t border-neutral-200">
                                    <span className="text-sm text-neutral-500">Total Return Amount: </span>
                                    <span className="font-medium text-primary-600">
                                        {parseFloat(returnItem.total_return_amount).toFixed(2)}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="text-right">
                            {returnItem.status === 'pending' && isAdmin && (
                                <Link to={`/purchases/returns/${returnItem.id}`}>
                                    <Button size="sm" variant="success">
                                        Allocate & Accept
                                    </Button>
                                </Link>
                            )}
                            {returnItem.accepted_at && (
                                <p className="text-xs text-neutral-400 mt-2">
                                    Accepted: {new Date(returnItem.accepted_at).toLocaleString()}
                                </p>
                            )}
                            {returnItem.accepted_by && (
                                <p className="text-xs text-neutral-400">
                                    By: {returnItem.accepted_by}
                                </p>
                            )}
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
};

ReturnList.propTypes = {
    returns: PropTypes.array,
    onAccept: PropTypes.func,
    isAdmin: PropTypes.bool,
};

export default ReturnList;
