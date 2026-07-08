import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import StatCard from './StatCard';
import StatCardSkeleton from './StatCardSkeleton';

const ReceivablesSection = ({ stats, loading, onCardClick }) => {
    if (loading) {
        return (
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Receivables</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCardSkeleton color="green" />
                    <StatCardSkeleton color="amber" />
                    <StatCardSkeleton color="blue" />
                    <StatCardSkeleton color="blue" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900">Receivables</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Cash in Hand"
                    value={stats?.cash_in_hand}
                    icon="💰"
                    color="green"
                    onClick={() => onCardClick('cashInHand', 'Cash in Hand Breakdown')}
                />
                <StatCard
                    label="Customer Outstanding"
                    value={stats?.customer_outstanding}
                    icon="👤"
                    color="amber"
                    onClick={() => onCardClick('customerOutstanding', 'Customer Outstanding Breakdown')}
                />
                <StatCard
                    label="Total Invoices Cash"
                    value={stats?.total_invoices_cash}
                    icon="📄"
                    color="blue"
                    onClick={() => onCardClick('invoicesCash', 'Invoices Cash Breakdown')}
                />
                <StatCard
                    label="Total Invoices"
                    value={stats?.total_number_of_invoices}
                    icon="📊"
                    color="blue"
                    isCurrency={false}
                    onClick={() => onCardClick('invoices', 'Invoices Breakdown')}
                />
            </div>
        </div>
    );
};

ReceivablesSection.propTypes = {
    stats: PropTypes.object,
    loading: PropTypes.bool,
    onCardClick: PropTypes.func.isRequired,
};

export default ReceivablesSection;