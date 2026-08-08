import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import Table from '../ui/Table';
import Badge from '../ui/Badge';
import Button from '../ui/Button';

const TIER_BADGE_VARIANT = {
    good: 'success',
    average: 'warning',
    poor: 'error',
};

const CustomerTable = ({ customers, onRowClick, onEdit, onDelete, isAdmin }) => {
    const columns = [
        { key: 'code', label: 'Code', width: '120px' },
        { key: 'name', label: 'Name' },
        { key: 'address', label: 'Address' },
        { key: 'mobile', label: 'Mobile', render: (value) => value || 'N/A' },
        {
            key: 'credit_score',
            label: 'Credit Score',
            width: '140px',
            render: (value, row) => value === null || value === undefined ? (
                'N/A'
            ) : (
                <span className="flex items-center gap-2">
                    <span className="font-medium">{value}</span>
                    <Badge variant={TIER_BADGE_VARIANT[row.credit_tier] || 'default'}>
                        {row.credit_tier}
                    </Badge>
                </span>
            ),
        },
        {
            key: 'created_at',
            label: 'Created',
            render: (value) => new Date(value).toLocaleDateString()
        },
        {
            key: 'is_deleted',
            label: 'Status',
            render: (value) => (
                <Badge variant={value ? 'error' : 'success'}>
                    {value ? 'Deleted' : 'Active'}
                </Badge>
            ),
        },
        {
            key: 'actions',
            label: 'Actions',
            width: '120px',
            render: (_, row) => isAdmin && !row.is_deleted && (
                <div className="flex gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                        className="text-primary-600 hover:text-primary-700 text-sm"
                    >
                        Edit
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(row.id); }}
                        className="text-error-600 hover:text-error-700 text-sm"
                    >
                        Delete
                    </button>
                </div>
            ),
        },
    ];

    if (customers.length === 0) {
        return (
            <div className="text-center py-12">
                <div className="text-6xl mb-4">👥</div>
                <h3 className="text-lg font-semibold text-neutral-900">No Customers Found</h3>
                <p className="text-sm text-neutral-500 mt-1">Try adjusting your search or filters</p>
            </div>
        );
    }

    return <Table columns={columns} data={customers} onRowClick={onRowClick} />;
};

CustomerTable.propTypes = {
    customers: PropTypes.array.isRequired,
    onRowClick: PropTypes.func,
    onEdit: PropTypes.func,
    onDelete: PropTypes.func,
    isAdmin: PropTypes.bool,
};

export default CustomerTable;