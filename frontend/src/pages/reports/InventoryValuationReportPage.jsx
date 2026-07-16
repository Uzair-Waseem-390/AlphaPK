import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsApi } from '../../services/reportsApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import SearchBar from '../../components/ui/SearchBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';

const formatCurrency = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const columns = [
    { key: 'product_name', label: 'Product' },
    { key: 'product_code', label: 'Code' },
    { key: 'category_name', label: 'Category' },
    { key: 'quantity_on_hand', label: 'Quantity On Hand' },
    { key: 'avg_unit_cost', label: 'Avg Unit Cost (PKR)', render: formatCurrency },
    { key: 'total_value', label: 'Total Value (PKR)', render: formatCurrency },
];

const InventoryValuationReportPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [searchTerm, setSearchTerm] = useState('');

    // Point-in-time snapshot — no date filters, just an optional search.
    const fetchValuationPage = (params) => {
        const p = { ...params };
        if (searchTerm) p.search = searchTerm;
        return reportsApi.inventoryValuation.get(p);
    };

    const {
        data: results, meta, extra, page, setPage, loading, error,
    } = usePaginatedList(fetchValuationPage, {}, 25, [searchTerm]);

    // Stats are computed server-side over the full filtered set (not just
    // the current page) and passed through as an extra top-level field.
    const stats = extra?.stats;

    if (!isAdmin) {
        navigate('/dashboard');
        return null;
    }

    const handleSearch = (value) => {
        setSearchTerm(value);
        setPage(1);
    };

    return (
        <div className="space-y-6">
            <div>
                <Link to="/reports" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Reports
                </Link>
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Inventory Valuation Report</h1>
                <p className="text-neutral-500 mt-1">Live snapshot of current stock valued at FIFO cost — no date range, this is right now</p>
            </div>

            <SearchBar
                onSearch={handleSearch}
                placeholder="Search products by name or code..."
            />

            {error && (
                <div className="p-4 bg-error-50 border border-error-200 rounded-lg">
                    <p className="text-sm text-error-600">{error}</p>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center min-h-[40vh]">
                    <LoadingSpinner size="lg" />
                </div>
            ) : (
                <>
                    {stats && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Products</p>
                                <p className="text-2xl font-bold text-neutral-900">{stats.total_products}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Quantity On Hand</p>
                                <p className="text-2xl font-bold text-neutral-900">{stats.total_quantity_on_hand}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Inventory Value (PKR)</p>
                                <p className="text-2xl font-bold text-success-600">
                                    {Number(stats.total_inventory_value || 0).toFixed(2)}
                                </p>
                            </Card>
                        </div>
                    )}

                    {results.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4">🏷️</div>
                            <h3 className="text-lg font-semibold text-neutral-900">No Stock Found</h3>
                            <p className="text-sm text-neutral-500 mt-1">Try adjusting your search</p>
                        </div>
                    ) : (
                        <>
                            <Table columns={columns} data={results} />
                            {meta.totalPages > 1 && (
                                <Pagination
                                    currentPage={meta.currentPage}
                                    totalPages={meta.totalPages}
                                    onPageChange={setPage}
                                />
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default InventoryValuationReportPage;
