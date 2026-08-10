import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import Table from '../ui/Table';
import EmptyState from '../ui/EmptyState';

const LedgerListTable = ({ ledgers, onRowClick, loading }) => {
    const columns = [
        { key: 'supplier_name', label: 'Supplier Name' },
        { key: 'supplier_code', label: 'Supplier Code', width: '120px' },
        {
            key: 'created_at',
            label: 'Account Since',
            render: (value) => new Date(value).toLocaleDateString()
        },
    ];

    if (loading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-12 bg-neutral-100 rounded-lg animate-pulse"></div>
                ))}
            </div>
        );
    }

    if (ledgers.length === 0) {
        return <EmptyState title="No ledgers found" description="No suppliers have been created yet." />;
    }

    return <Table columns={columns} data={ledgers} onRowClick={onRowClick} />;
};

LedgerListTable.propTypes = {
    ledgers: PropTypes.array.isRequired,
    onRowClick: PropTypes.func,
    loading: PropTypes.bool,
};

export default LedgerListTable;