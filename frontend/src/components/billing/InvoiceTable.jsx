import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import Table from '../ui/Table';
import Button from '../ui/Button';
import InvoiceStatusBadge from './InvoiceStatusBadge';
import PaymentStatusBadge from './PaymentStatusBadge';

const InvoiceTable = ({
    invoices,
    onRowClick,
    onEdit,
    onDelete,
    onConfirm,
    onPrint,
    onExtendDueDate,
    isAdmin,
    showActions = true
}) => {
    const columns = [
        { key: 'bill_number', label: 'Bill #', width: '120px' },
        {
            key: 'customer',
            label: 'Customer',
            render: (value) => value?.name || 'N/A'
        },
        {
            key: 'status',
            label: 'Status',
            render: (value) => <InvoiceStatusBadge status={value} />
        },
        {
            key: 'grand_total',
            label: 'Total (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
        },
        {
            key: 'payment_status',
            label: 'Payment',
            render: (value) => <PaymentStatusBadge status={value} />
        },
        {
            key: 'credit_outstanding',
            label: 'Outstanding (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
        },
        {
            key: 'payment_due_date',
            label: 'Due Date',
            render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A'
        },
        {
            key: 'confirmed_at',
            label: 'Confirmed',
            render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A'
        },
        {
            key: 'created_at',
            label: 'Created',
            render: (value) => new Date(value).toLocaleDateString()
        },
    ];

    if (showActions) {
        columns.push({
            key: 'actions',
            label: 'Actions',
            width: '200px',
            render: (_, row) => (
                <div className="flex gap-1 flex-wrap">
                    {row.status === 'draft' && (
                        <>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                            >
                                Edit
                            </Button>
                            <Button
                                size="sm"
                                variant="danger"
                                onClick={(e) => { e.stopPropagation(); onDelete(row.id); }}
                            >
                                Delete
                            </Button>
                            {isAdmin && (
                                <Button
                                    size="sm"
                                    variant="success"
                                    onClick={(e) => { e.stopPropagation(); onConfirm(row.id); }}
                                >
                                    Confirm
                                </Button>
                            )}
                        </>
                    )}
                    {row.status !== 'draft' && (
                        <>
                            {isAdmin && (
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    style={{ width: '5.5rem', height: '2.25rem' }}
                                    onClick={(e) => { e.stopPropagation(); onPrint(row.id, false); }}
                                >
                                    Print
                                </Button>
                            )}
                            {isAdmin && row.payment_status !== 'paid' && onExtendDueDate && (
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    style={{ width: '5.5rem', height: '2.25rem' }}
                                    title="Extend Due Date"
                                    onClick={(e) => { e.stopPropagation(); onExtendDueDate(row); }}
                                >
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M12 14v3m0 0h1.5M12 17h-1.5" />
                                    </svg>
                                </Button>
                            )}
                        </>
                    )}
                </div>
            ),
        });
    }

    if (invoices.length === 0) {
        return (
            <div className="text-center py-12">
                <div className="text-6xl mb-4">📄</div>
                <h3 className="text-lg font-semibold text-neutral-900">No Invoices Found</h3>
                <p className="text-sm text-neutral-500 mt-1">Try adjusting your search or filters</p>
            </div>
        );
    }

    return <Table columns={columns} data={invoices} onRowClick={onRowClick} />;
};

InvoiceTable.propTypes = {
    invoices: PropTypes.array.isRequired,
    onRowClick: PropTypes.func,
    onEdit: PropTypes.func,
    onDelete: PropTypes.func,
    onConfirm: PropTypes.func,
    onPrint: PropTypes.func,
    onExtendDueDate: PropTypes.func,
    isAdmin: PropTypes.bool,
    showActions: PropTypes.bool,
};

export default InvoiceTable;