import PropTypes from 'prop-types';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';

import { Link } from 'react-router-dom';

const PaymentHistoryList = ({ payments, onDelete, isAdmin = false }) => {
    if (!payments || payments.length === 0) {
        return (
            <div className="text-center py-4 text-neutral-500">
                No payments recorded for this invoice
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {payments.map((payment) => (
                <div key={payment.id} className="flex justify-between items-center p-3 bg-neutral-50 rounded-lg">
                    <div>
                        {parseFloat(payment.amount) > 0 ? (
                            <Link 
                                to={`/billing/payments/${payment.id}`}
                                className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
                            >
                                {payment.reference_number}
                            </Link>
                        ) : (
                            <p className="font-medium">{payment.reference_number}</p>
                        )}
                        <p className="text-sm text-neutral-500">
                            {payment.method_display || payment.method}
                            {payment.payment_date && (
                                <span className="ml-2">
                                    • {new Date(payment.payment_date).toLocaleDateString()}
                                </span>
                            )}
                        </p>
                        {payment.note && (
                            <p className="text-xs text-neutral-400 mt-0.5">{payment.note}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="font-medium text-success-600">
                                {typeof payment.amount === 'string'
                                    ? parseFloat(payment.amount).toFixed(2)
                                    : '0.00'}
                            </p>
                            <p className="text-xs text-neutral-500">
                                {payment.created_by || 'System'}
                            </p>
                        </div>
                        {isAdmin && onDelete && (
                            <Button
                                size="sm"
                                variant="danger"
                                onClick={() => onDelete(payment.id)}
                            >
                                Delete
                            </Button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

PaymentHistoryList.propTypes = {
    payments: PropTypes.array,
    onDelete: PropTypes.func,
    isAdmin: PropTypes.bool,
};

export default PaymentHistoryList;