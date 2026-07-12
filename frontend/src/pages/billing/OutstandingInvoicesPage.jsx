import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { billingApi } from '../../services/billingApi';
import Table from '../../components/ui/Table';
import SearchBar from '../../components/ui/SearchBar';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PaymentStatusBadge from '../../components/billing/PaymentStatusBadge';
import InvoiceStatusBadge from '../../components/billing/InvoiceStatusBadge';
import FilterBar from '../../components/ui/FilterBar';
import Pagination from '../../components/ui/Pagination';
import { usePaginatedList } from '../../hooks/usePaginatedList';

const OutstandingInvoicesPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // Fetch outstanding invoices
    const fetchOutstandingInvoicesPage = (params) => {
        const p = { ...params };
        if (searchTerm) p.customer_name = searchTerm;
        return billingApi.invoices.getOutstanding(p);
    };

    const {
        data: invoices, meta, page, setPage, loading,
        filters, setFilters,
    } = usePaginatedList(fetchOutstandingInvoicesPage, {}, 25, [searchTerm]);

    const handleSearch = (value) => {
        setSearchTerm(value);
        setPage(1);
    };

    const handleApplyFilters = (filterValues) => {
        setFilters(filterValues);
    };

    const handleResetFilters = () => {
        setFilters({});
        setSearchTerm('');
    };

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
            label: 'Grand Total (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
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
            key: 'payment_status',
            label: 'Payment Status',
            render: (value) => <PaymentStatusBadge status={value} />
        },
        {
            key: 'confirmed_at',
            label: 'Confirmed',
            render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A'
        },
    ];

    // Filter configuration for the FilterBar
    const filterConfig = [
        {
            name: 'payment_status',
            label: 'Payment Status',
            type: 'select',
            options: [
                { value: '', label: 'All Payment Status' },
                { value: 'unpaid', label: 'Unpaid' },
                { value: 'partial', label: 'Partial' },
            ],
        },
        { name: 'date_from', label: 'Date From', type: 'date' },
        { name: 'date_to', label: 'Date To', type: 'date' },
        { name: 'min_outstanding', label: 'Min Outstanding', type: 'number' },
        { name: 'max_outstanding', label: 'Max Outstanding', type: 'number' },
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
                <h1 className="text-3xl font-bold text-neutral-900">Outstanding Invoices</h1>
                <p className="text-neutral-500 mt-1">
                    All invoices with outstanding balance (credit_outstanding &gt; 0)
                </p>
                <p className="text-sm text-neutral-400 mt-1">
                    {meta.count} invoice{meta.count !== 1 ? 's' : ''} with outstanding balance
                </p>
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <div className="flex-1">
                        <SearchBar
                            onSearch={handleSearch}
                            placeholder="Search by customer name..."
                            className="w-full"
                            value={searchTerm}
                        />
                    </div>
                    <Button
                        variant="secondary"
                        onClick={() => setShowFilters(!showFilters)}
                        icon={({ className }) => (
                            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                        )}
                    >
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </Button>
                    {(Object.keys(filters).length > 0 || searchTerm) && (
                        <Button variant="secondary" onClick={handleResetFilters}>
                            Clear All
                        </Button>
                    )}
                </div>

                {showFilters && (
                    <FilterBar
                        filters={filterConfig}
                        onApply={handleApplyFilters}
                        onReset={handleResetFilters}
                    />
                )}
            </div>

            {invoices.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">✅</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Outstanding Invoices</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                        All invoices have been fully paid or there are no invoices yet.
                    </p>
                </div>
            ) : (
                <>
                    <Table
                        columns={columns}
                        data={invoices}
                        onRowClick={(invoice) => navigate(`/billing/invoices/${invoice.id}`)}
                    />

                    {meta.totalPages > 1 && (
                        <Pagination
                            currentPage={meta.currentPage}
                            totalPages={meta.totalPages}
                            onPageChange={setPage}
                        />
                    )}
                </>
            )}
        </div>
    );
};

export default OutstandingInvoicesPage;