import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import SearchBar from '../../components/ui/SearchBar';
import Select from '../../components/ui/Select';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import FilterBar from '../../components/ui/FilterBar';
import { Link } from 'react-router-dom';

const GlobalPaymentsPage = () => {
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [orderDetails, setOrderDetails] = useState({});

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
            const data = await purchasesApi.payments.getAll(params);
            setPayments(data || []);

            // Fetch order details for each payment to get supplier name
            const orderIds = [...new Set(data.map(p => p.order).filter(id => id))];
            const orderPromises = orderIds.map(id => purchasesApi.orders.getById(id));
            const orderResults = await Promise.allSettled(orderPromises);

            const orderMap = {};
            orderResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    const order = result.value;
                    orderMap[order.id] = order;
                }
            });
            setOrderDetails(orderMap);
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
            key: 'order',
            label: 'Order #',
            render: (value) => {
                if (value) {
                    const order = orderDetails[value];
                    return order?.order_number || value;
                }
                return 'N/A';
            }
        },
        {
            key: 'order',
            label: 'Supplier',
            render: (value) => {
                if (value) {
                    const order = orderDetails[value];
                    return order?.supplier?.name || 'N/A';
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
        {
            key: 'note',
            label: 'Note',
            render: (value) => value || '-'
        },
        {
            key: 'actions',
            label: 'Actions',
            width: '100px',
            render: (_, row) => (
                <Link
                    to={`/purchases/payments/ref/${row.reference_number}`}
                    className="text-primary-600 hover:text-primary-700 text-sm"
                >
                    View
                </Link>
            ),
        },
    ];

    const filterConfig = [
        { name: 'supplier_name', label: 'Supplier Name', type: 'text' },
        { name: 'supplier_code', label: 'Supplier Code', type: 'text' },
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
                    Search and manage all payments across all purchase orders
                </p>
                <div className="mt-2 text-sm text-neutral-400">
                    <p>• This page shows all payments from all suppliers</p>
                    <p>• Use the search bar to find a payment by reference number</p>
                    <p>• Click "View" on any payment to see it in the order context</p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <div className="flex-1">
                        <SearchBar
                            onSearch={handleSearch}
                            placeholder="Search by reference number (e.g., SPY-2026-0001)..."
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

            <Table columns={columns} data={payments} />
        </div>
    );
};

export default GlobalPaymentsPage;