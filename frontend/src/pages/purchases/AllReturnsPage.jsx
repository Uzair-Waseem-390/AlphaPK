import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import SearchBar from '../../components/ui/SearchBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import FilterBar from '../../components/ui/FilterBar';
import Pagination from '../../components/ui/Pagination';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { Link, useNavigate } from 'react-router-dom';

const AllReturnsPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
    const navigate = useNavigate();

    const [searchTerm, setSearchTerm] = useState('');
    const [suppliers, setSuppliers] = useState([]);
    const [showFilters, setShowFilters] = useState(false);

    const fetchReturnsPage = (params) => {
        const p = { ...params };
        if (searchTerm) {
            p.order_number = searchTerm;
        }
        return purchasesApi.returns.getAll(p);
    };

    const {
        data: returns, meta, page, setPage, loading,
        filters, setFilters, refetch: fetchAllReturns,
    } = usePaginatedList(fetchReturnsPage, {}, 25, [searchTerm]);

    useEffect(() => {
        loadSuppliers();
    }, []);

    const loadSuppliers = async () => {
        try {
            const data = await purchasesApi.suppliers.getAll();
            setSuppliers(data || []);
        } catch (error) {
            console.error('Failed to load suppliers:', error);
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
        setPage(1);
    };

    const handleAcceptReturn = async (returnId) => {
        if (!window.confirm('Are you sure you want to accept this return?')) return;

        try {
            await purchasesApi.returns.accept(returnId);
            fetchAllReturns();
        } catch (error) {
            console.error('Failed to accept return:', error);
        }
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
            key: 'order_number',
            label: 'Order #',
            render: (value) => value || 'N/A'
        },
        {
            key: 'supplier_name',
            label: 'Supplier',
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
            label: 'Date',
            render: (value) => value ? new Date(value).toLocaleDateString() : 'N/A'
        },
        { key: 'note', label: 'Note', render: (value) => value || '-' },
        {
            key: 'actions',
            label: 'Actions',
            width: '120px',
            render: (_, row) => row.status === 'pending' && isAdmin && (
                <Button
                    size="sm"
                    variant="success"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleAcceptReturn(row.id);
                    }}
                >
                    Accept
                </Button>
            ),
        },
    ];

    // Filter configuration for the FilterBar
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
        {
            name: 'supplier_name',
            label: 'Supplier Name',
            type: 'select',
            options: [
                { value: '', label: 'All Suppliers' },
                ...suppliers.map(s => ({ value: s.name, label: s.name })),
            ],
        },
        {
            name: 'supplier_code',
            label: 'Supplier Code',
            type: 'select',
            options: [
                { value: '', label: 'All Supplier Codes' },
                ...suppliers.map(s => ({ value: s.code, label: s.code })),
            ],
        },
        { name: 'order_number', label: 'Order Number', type: 'text' },
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">All Returns</h1>
                    <p className="text-neutral-500 mt-1">View all purchase returns across all orders</p>
                </div>
                <Link to="/purchases/orders" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Orders
                </Link>
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <div className="flex-1">
                        <SearchBar
                            onSearch={handleSearch}
                            placeholder="Search by order number..."
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
                data={returns}
                onRowClick={(ret) => navigate(`/purchases/returns/${ret.id}`)}
            />

            {meta.totalPages > 1 && (
                <Pagination
                    currentPage={meta.currentPage}
                    totalPages={meta.totalPages}
                    onPageChange={setPage}
                />
            )}
        </div>
    );
};

export default AllReturnsPage;