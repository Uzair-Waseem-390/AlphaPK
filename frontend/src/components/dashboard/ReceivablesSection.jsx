import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { User, FileText, BarChart3 } from 'lucide-react';
import StatCard from './StatCard';
import StatCardSkeleton from './StatCardSkeleton';

const ReceivablesSection = ({ stats, loading, onCardClick }) => {
    if (loading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-amber-500 flex-shrink-0" />
                    <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">Receivables</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCardSkeleton color="amber" />
                    <StatCardSkeleton color="blue" />
                    <StatCardSkeleton color="blue" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-amber-500 flex-shrink-0" />
                <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wider">Receivables</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                    label="Customer Outstanding"
                    value={stats?.customer_outstanding}
                    icon={User}
                    color="amber"
                    onClick={() => onCardClick('customerOutstanding', 'Customer Outstanding Breakdown')}
                />
                <StatCard
                    label="Total Invoices Cash"
                    value={stats?.total_invoices_cash}
                    icon={FileText}
                    color="blue"
                    onClick={() => onCardClick('invoicesCash', 'Invoices Cash Breakdown')}
                />
                <StatCard
                    label="Total Invoices"
                    value={stats?.total_number_of_invoices}
                    icon={BarChart3}
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