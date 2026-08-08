import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { creditScoreApi } from '../../services/creditScoreApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import SearchBar from '../../components/ui/SearchBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';

const TIER_BADGE_VARIANT = {
    good: 'success',
    average: 'warning',
    poor: 'error',
};

const columns = [
    { key: 'customer_code', label: 'Code', width: '100px' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'score', label: 'Score', width: '100px' },
    {
        key: 'tier',
        label: 'Tier',
        render: (value, row) => (
            <Badge variant={TIER_BADGE_VARIANT[value] || 'default'}>{row.tier_display}</Badge>
        ),
    },
    {
        key: 'last_calculated_at',
        label: 'Last Calculated',
        render: (value) => value ? new Date(value).toLocaleString() : 'N/A',
    },
];

const TIER_TABS = [
    { value: '', label: 'All' },
    { value: 'good', label: 'Good (70+)' },
    { value: 'average', label: 'Average (31-69)' },
    { value: 'poor', label: 'Poor (≤30)' },
];

const CreditCustomerReportPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const {
        data: results, meta, page, setPage, loading, error,
        filters, setFilters,
    } = usePaginatedList(creditScoreApi.customers.getAll, {});

    if (!isAdmin) {
        navigate('/dashboard');
        return null;
    }

    const activeTier = filters.tier || '';

    const handleTierChange = (tier) => {
        setFilters({ ...filters, tier: tier || undefined });
    };

    const handleSearch = (value) => {
        setFilters({ ...filters, search: value || undefined });
    };

    const handleRowClick = (row) => {
        navigate(`/billing/customers/${row.customer_id}`);
    };

    return (
        <div className="space-y-6">
            <div>
                <Link to="/reports" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Reports
                </Link>
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Credit Customer Report</h1>
                <p className="text-neutral-500 mt-1">Customers grouped by their system-calculated credit score</p>
            </div>

            <div className="space-y-4">
                <SearchBar
                    onSearch={handleSearch}
                    placeholder="Search by customer name or code..."
                    className="max-w-md"
                />

                <div className="flex gap-2 flex-wrap">
                    {TIER_TABS.map((tab) => (
                        <Button
                            key={tab.value || 'all'}
                            size="sm"
                            variant={activeTier === tab.value ? 'primary' : 'secondary'}
                            onClick={() => handleTierChange(tab.value)}
                        >
                            {tab.label}
                        </Button>
                    ))}
                </div>
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
            ) : results.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">📊</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Customers Found</h3>
                    <p className="text-sm text-neutral-500 mt-1">Try a different tier or search term</p>
                </div>
            ) : (
                <>
                    <Card className="p-0 overflow-hidden">
                        <Table columns={columns} data={results} onRowClick={handleRowClick} />
                    </Card>
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

export default CreditCustomerReportPage;
