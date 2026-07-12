import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuppliersOutstanding } from '../../hooks/usePurchases';
import Table from '../../components/ui/Table';
import SearchBar from '../../components/ui/SearchBar';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import FilterBar from '../../components/ui/FilterBar';
import Pagination from '../../components/ui/Pagination';

const SuppliersOutstandingPage = () => {
    const navigate = useNavigate();
    const { data, meta, page, setPage, loading, filters, setFilters } = useSuppliersOutstanding();
    const [showFilters, setShowFilters] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const handleSearch = (value) => {
        setSearchTerm(value);
        const next = { ...filters };
        if (value) {
            next.search = value;
        } else {
            delete next.search;
        }
        setFilters(next);
    };

    const handleApplyFilters = (filterValues) => {
        setFilters({
            ...filterValues,
            ...(filters.search ? { search: filters.search } : {}),
        });
    };

    const handleResetFilters = () => {
        setSearchTerm('');
        setFilters({});
    };

    const filterConfig = [
        {
            name: 'payment_status',
            label: 'Payment Status',
            type: 'select',
            options: [
                { value: 'unpaid', label: 'Unpaid' },
                { value: 'partial', label: 'Partial' },
            ],
        },
        { name: 'min_outstanding', label: 'Min Outstanding', type: 'number' },
        { name: 'max_outstanding', label: 'Max Outstanding', type: 'number' },
    ];

    const columns = [
        { key: 'code', label: 'Code', width: '120px' },
        { key: 'name', label: 'Name' },
        {
            key: 'outstanding',
            label: 'Outstanding (PKR)',
            render: (value) => (
                <span className="font-semibold text-error-600">
                    {typeof value === 'string' ? parseFloat(value).toFixed(2) : '0.00'}
                </span>
            )
        },
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
                <h1 className="text-3xl font-bold text-neutral-900">Suppliers Outstanding</h1>
                <p className="text-neutral-500 mt-1">View suppliers with outstanding balances</p>
                <p className="text-sm text-neutral-400 mt-1">
                    {data.length} supplier{data.length !== 1 ? 's' : ''} with outstanding balance
                </p>
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <div className="flex-1">
                        <SearchBar
                            onSearch={handleSearch}
                            placeholder="Search suppliers..."
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

            {data.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">✅</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Suppliers with Outstanding</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                        All suppliers have settled their balances.
                    </p>
                </div>
            ) : (
                <>
                    <Table
                        columns={columns}
                        data={data}
                        onRowClick={(supplier) => navigate(`/purchases/suppliers/${supplier.id}`)}
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

export default SuppliersOutstandingPage;