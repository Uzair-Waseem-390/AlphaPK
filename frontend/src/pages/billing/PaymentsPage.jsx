import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { billingApi } from '../../services/billingApi';
import Table from '../../components/ui/Table';
import SearchBar from '../../components/ui/SearchBar';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import FilterBar from '../../components/ui/FilterBar';
import { Link, useNavigate } from 'react-router-dom';

const PaymentsPage = () => {
    const navigate = useNavigate();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [invoiceDetails, setInvoiceDetails] = useState({});

    useEffect(() => {
        fetchPayments();
    }, [filters, searchTerm]);

    const fetchPayments = async () => {
        setLoading(true);
        try {
            const params = { ...filters };
            if (searchTerm) {
                params.reference = searchTerm;
            }
            const data = await billingApi.payments.getAll(params);
            setPayments(data || []);

            // Fetch invoice details for each payment
            const invoiceIds = [...new Set(data.map(p => p.invoice).filter(id => id))];
            if (invoiceIds.length > 0) {
                const invoicePromises = invoiceIds.map(id =>
                    billingApi.invoices.getById(id).catch(() => null)
                );
                const invoiceResults = await Promise.all(invoicePromises);

                const invoiceMap = {};
                invoiceResults.forEach((invoice, index) => {
                    if (invoice) {
                        invoiceMap[invoiceIds[index]] = invoice;
                    }
                });
                setInvoiceDetails(invoiceMap);
            }
        } catch (error) {
            console.error('Failed to fetch payments:', error);
            setPayments([]);
        } finally {
            setLoading(false);
        }
    };

    const handleApplyFilters = (filterValues) => {
        setFilters(filterValues);
    };

    const handleResetFilters = () => {
        setFilters({});
        setSearchTerm('');
    };

    const handleSearch = (value) => {
        setSearchTerm(value);
    };

    const columns = [
        { key: 'reference_number', label: 'Reference', width: '140px' },
        {
            key: 'invoice',
            label: 'Bill #',
            render: (value) => {
                if (value && invoiceDetails[value]) {
                    return invoiceDetails[value].bill_number || 'N/A';
                }
                return value || 'N/A';
            }
        },
        {
            key: 'invoice',
            label: 'Customer',
            render: (value) => {
                if (value && invoiceDetails[value]) {
                    return invoiceDetails[value].customer?.name || 'N/A';
                }
                return 'N/A';
            }
        },
        {
            key: 'amount',
            label: 'Amount (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
        },
        {
            key: 'method_display',
            label: 'Method',
            render: (value) => <Badge>{value || 'N/A'}</Badge>
        },
        {
            key: 'payment_date',
            label: 'Date',
            render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A'
        },
        { key: 'note', label: 'Note', render: (value) => value || '-' },
        {
            key: 'actions',
            label: 'Actions',
            width: '100px',
            render: (_, row) => {
                return (
                    <Link
                        to={`/billing/payments/${row.id}`}
                        className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                    >
                        View
                    </Link>
                );
            },
        },
    ];

    const filterConfig = [
        { name: 'customer_name', label: 'Customer Name', type: 'text' },
        { name: 'customer_code', label: 'Customer Code', type: 'text' },
        {
            name: 'method',
            label: 'Payment Method',
            type: 'select',
            options: [
                { value: '', label: 'All Methods' },
                { value: 'cash', label: 'Cash' },
                { value: 'jazzcash', label: 'JazzCash' },
                { value: 'easypaisa', label: 'Easypaisa' },
                { value: 'bank', label: 'Bank Transfer' },
            ],
        },
        { name: 'date_from', label: 'Date From', type: 'date' },
        { name: 'date_to', label: 'Date To', type: 'date' },
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
                <h1 className="text-3xl font-bold text-neutral-900">All Payments</h1>
                <p className="text-neutral-500 mt-1">
                    Search and manage all payments across all invoices
                </p>
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <div className="flex-1">
                        <SearchBar
                            onSearch={handleSearch}
                            placeholder="Search by reference number..."
                            className="w-full"
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

            <Table 
                columns={columns} 
                data={payments} 
                onRowClick={(row) => navigate(`/billing/payments/${row.id}`)}
            />

            {payments.length === 0 && (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">💰</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Payments Found</h3>
                    <p className="text-sm text-neutral-500 mt-1">Try adjusting your search or filters</p>
                </div>
            )}
        </div>
    );
};

export default PaymentsPage;