import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { billingApi } from '../../services/billingApi';
import Table from '../../components/ui/Table';
import SearchBar from '../../components/ui/SearchBar';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import FilterBar from '../../components/ui/FilterBar';

const ReturnsPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [returns, setReturns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    const fetchReturns = useCallback(async () => {
        setLoading(true);
        try {
            const params = { ...filters };
            if (searchTerm) {
                params.reference = searchTerm; // Assuming backend handles search mostly via reference, or we can just send search to the backend. The backend we created supports reference, bill_number, customer_name. Since we only have one searchTerm, we can either pass it as 'reference' or the backend could be updated to support a generic 'search' param. For now, let's just fetch all if searchTerm is present and filter locally, OR use the backend params. Wait, let's just pass params and filter the rest locally since we have multiple fields. Actually, our new API supports `reference`, `bill_number`, `customer_name`. But our `searchTerm` can be any of those. Let's just pass `filters` to backend and filter `searchTerm` locally for maximum flexibility.
            }
            
            // Get all returns based on filters
            const data = await billingApi.returns.getAll(filters);
            let filtered = data || [];

            // Apply searchTerm locally since it matches against 3 different fields
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                filtered = filtered.filter(r =>
                    r.reference_number?.toLowerCase().includes(term) ||
                    r.invoice_bill_number?.toLowerCase().includes(term) ||
                    r.customer_name?.toLowerCase().includes(term)
                );
            }

            setReturns(filtered);
        } catch (error) {
            console.error('Failed to fetch returns:', error);
            setReturns([]);
        } finally {
            setLoading(false);
        }
    }, [filters, searchTerm]);

    useEffect(() => {
        fetchReturns();
    }, [fetchReturns]);

    const handleSearch = (value) => {
        setSearchTerm(value);
    };

    const handleApplyFilters = (filterValues) => {
        setFilters(filterValues);
    };

    const handleResetFilters = () => {
        setFilters({});
        setSearchTerm('');
    };

    const handleRowClick = (returnItem) => {
        navigate(`/billing/returns/${returnItem.id}`);
    };

    const getStatusBadge = (status) => {
        const variants = {
            pending: 'pending',
            accepted: 'accepted',
        };
        return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
    };

    const columns = [
        { key: 'reference_number', label: 'Return #', width: '140px' },
        {
            key: 'invoice_bill_number',
            label: 'Bill #',
            render: (value) => value || 'N/A'
        },
        {
            key: 'customer_name',
            label: 'Customer',
            render: (value) => value || 'N/A'
        },
        {
            key: 'status',
            label: 'Status',
            render: getStatusBadge
        },
        {
            key: 'total_return_amount',
            label: 'Amount (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
        },
        {
            key: 'created_at',
            label: 'Created',
            render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A'
        },
        {
            key: 'accepted_at',
            label: 'Accepted',
            render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A'
        },
    ];

    const filterConfig = [
        {
            name: 'status',
            label: 'Status',
            type: 'select',
            options: [
                { value: '', label: 'All Status' },
                { value: 'pending', label: 'Pending' },
                { value: 'accepted', label: 'Accepted' },
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
                <h1 className="text-3xl font-bold text-neutral-900">Returns</h1>
                <p className="text-neutral-500 mt-1">
                    View all customer returns across all invoices
                </p>
                <p className="text-sm text-neutral-400 mt-1">
                    {returns.length} return{returns.length !== 1 ? 's' : ''} found
                </p>
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <div className="flex-1">
                        <SearchBar
                            onSearch={handleSearch}
                            placeholder="Search by return #, bill #, or customer..."
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

            {returns.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">↩️</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Returns Found</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                        {Object.keys(filters).length > 0 || searchTerm ? 'Try adjusting your search or filters' : 'No returns have been created yet.'}
                    </p>
                </div>
            ) : (
                <Table
                    columns={columns}
                    data={returns}
                    onRowClick={handleRowClick}
                />
            )}
        </div>
    );
};

export default ReturnsPage;