import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { billingApi } from '../../services/billingApi';
import Table from '../../components/ui/Table';
import SearchBar from '../../components/ui/SearchBar';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import FilterBar from '../../components/ui/FilterBar';
import Pagination from '../../components/ui/Pagination';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useNavigate } from 'react-router-dom';

const CustomerOutstandingPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    const fetchCustomersPage = (params) => {
        const p = { ...params };
        if (searchTerm) p.search = searchTerm;
        return billingApi.customers.getOutstanding(p);
    };

    const {
        data: customers, meta, page, setPage, loading,
        filters, setFilters,
    } = usePaginatedList(fetchCustomersPage, {}, 25, [searchTerm]);

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
        { key: 'code', label: 'Code', width: '120px' },
        { key: 'name', label: 'Name' },
        {
            key: 'outstanding',
            label: 'Outstanding (PKR)',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return isNaN(num) ? '0.00' : num.toFixed(2);
            }
        },
        {
            key: 'payment_status',
            label: 'Status',
            render: (value) => (
                <Badge variant={value === 'paid' ? 'paid' : value === 'partial' ? 'partial' : 'unpaid'}>
                    {value || 'N/A'}
                </Badge>
            ),
        },
    ];

    const filterConfig = [
        {
            name: 'payment_status',
            label: 'Payment Status',
            type: 'select',
            options: [
                { value: '', label: 'All Status' },
                { value: 'unpaid', label: 'Unpaid' },
                { value: 'partial', label: 'Partial' },
            ],
        },
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
                <h1 className="text-3xl font-bold text-neutral-900">Customers Outstanding</h1>
                <p className="text-neutral-500 mt-1">View customers with outstanding balances</p>
                <p className="text-sm text-neutral-400 mt-1">
                    {meta.count} customer{meta.count !== 1 ? 's' : ''} with outstanding balance
                </p>
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <div className="flex-1">
                        <SearchBar
                            onSearch={handleSearch}
                            placeholder="Search by name or code..."
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

            {customers.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">✅</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Customers with Outstanding</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                        All customers have settled their balances.
                    </p>
                </div>
            ) : (
                <>
                    <Table
                        columns={columns}
                        data={customers}
                        onRowClick={(customer) => navigate(`/billing/customers/${customer.id}`)}
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

export default CustomerOutstandingPage;