import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsApi } from '../../services/reportsApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { printReport } from '../../utils/print';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import FilterBar from '../../components/ui/FilterBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';

const filterConfig = [
    { name: 'date', label: 'Exact Date', type: 'date' },
    { name: 'date_from', label: 'Date From', type: 'date' },
    { name: 'date_to', label: 'Date To', type: 'date' },
    { name: 'search', label: 'Product', type: 'text' },
];

// Net columns are deliberately computed here, on the current page only —
// never stored or sent to the backend. The report is paginated (25 rows),
// so this is cheap regardless of how many products exist overall.
const columns = [
    { key: 'product_name', label: 'Product' },
    { key: 'product_code', label: 'Code' },
    { key: 'total_purchased', label: 'Purchased' },
    { key: 'total_purchase_returned', label: 'Purchase Returned' },
    {
        key: '_net_purchased',
        label: 'Net Purchased',
        render: (_v, row) => row.total_purchased - row.total_purchase_returned,
    },
    { key: 'total_sold', label: 'Sold' },
    { key: 'total_sale_returned', label: 'Sale Returned' },
    {
        key: '_net_sold',
        label: 'Net Sold',
        render: (_v, row) => row.total_sold - row.total_sale_returned,
    },
    { key: 'total_lost', label: 'Lost' },
    { key: 'total_found', label: 'Found' },
];

const StockMovementReportPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [showFilters, setShowFilters] = useState(false);
    const [printing, setPrinting] = useState(false);

    const {
        data: results, meta, extra, page, setPage, loading, error,
        filters, setFilters,
    } = usePaginatedList(reportsApi.stockMovement.get, {});

    const stats = extra?.stats;

    if (!isAdmin) {
        navigate('/dashboard');
        return null;
    }

    const handleApplyFilters = (filterValues) => setFilters(filterValues);
    const handleResetFilters = () => setFilters({});

    const handlePrint = async () => {
        setPrinting(true);
        try {
            await printReport('/reports/stock-movement/print/', filters);
        } catch (err) {
            alert(err.message || 'Failed to print report');
        } finally {
            setPrinting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <Link to="/reports" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Reports
                </Link>
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Stock Movement Report</h1>
                <p className="text-neutral-500 mt-1">
                    How much of each product was purchased, returned to suppliers, sold, returned by customers, lost, and found.
                </p>
            </div>

            <div className="space-y-4">
                <div className="flex gap-4">
                    <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </Button>
                    {Object.keys(filters).length > 0 && (
                        <Button variant="secondary" onClick={handleResetFilters}>
                            Clear All
                        </Button>
                    )}
                    <Button variant="secondary" onClick={handlePrint} loading={printing}>
                        Print
                    </Button>
                </div>

                {showFilters && (
                    <FilterBar
                        filters={filterConfig}
                        onApply={handleApplyFilters}
                        onReset={handleResetFilters}
                    />
                )}
            </div>

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
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Purchased</p>
                                <p className="text-2xl font-bold text-neutral-900">{stats.total_purchased}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Purchase Returned</p>
                                <p className="text-2xl font-bold text-error-600">{stats.total_purchase_returned}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Sold</p>
                                <p className="text-2xl font-bold text-success-600">{stats.total_sold}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Sale Returned</p>
                                <p className="text-2xl font-bold text-error-600">{stats.total_sale_returned}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Lost</p>
                                <p className="text-2xl font-bold text-error-600">{stats.total_lost}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-sm text-neutral-500">Total Found</p>
                                <p className="text-2xl font-bold text-success-600">{stats.total_found}</p>
                            </Card>
                        </div>
                    )}

                    {results.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4">📦</div>
                            <h3 className="text-lg font-semibold text-neutral-900">No Movement Found</h3>
                            <p className="text-sm text-neutral-500 mt-1">Try adjusting your filters or search</p>
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

export default StockMovementReportPage;
