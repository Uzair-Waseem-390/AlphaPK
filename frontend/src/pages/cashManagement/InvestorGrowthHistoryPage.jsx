import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useInvestorValuationEntries } from '../../hooks/useCashManagement';
import { cashManagementApi } from '../../services/cashManagementApi';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import FilterBar from '../../components/ui/FilterBar';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const InvestorGrowthHistoryPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const initialInvestorId = location.state?.investor_id;

    const {
        data: entries, meta, page, setPage, loading, filters, setFilters,
    } = useInvestorValuationEntries(initialInvestorId ? { investor_id: initialInvestorId } : {});

    const [showFilters, setShowFilters] = useState(!!initialInvestorId);
    const [investors, setInvestors] = useState([]);

    useEffect(() => {
        cashManagementApi.investors.getAll({ page_size: 500 }).then((res) => {
            setInvestors(res?.results ?? res ?? []);
        });
    }, []);

    const handleApplyFilters = (values) => setFilters(values);
    const handleResetFilters = () => setFilters({});
    const handleRowClick = (row) => navigate(`/cash-management/investors/${row.investor}`);

    const filterConfig = [
        { name: 'investor_id', label: 'Investor', type: 'select', options: [
            { value: '', label: 'All' },
            ...investors.map((i) => ({ value: i.id, label: i.name })),
        ] },
    ];

    const columns = [
        { key: 'investor_name', label: 'Investor' },
        { key: 'period', label: 'Period' },
        { key: 'rate_applied', label: 'Rate', render: (v) => `${(parseFloat(v) * 100).toFixed(2)}%` },
        { key: 'worth_before', label: 'Worth Before', render: (v) => `Rs. ${fmt(v)}` },
        {
            key: 'amount',
            label: 'Growth',
            render: (v) => <span className="font-semibold text-success-600">+Rs. {fmt(v)}</span>,
        },
        { key: 'worth_after', label: 'Worth After', render: (v) => <span className="font-semibold">Rs. {fmt(v)}</span> },
        { key: 'note', label: 'Note', render: (v) => v || <span className="text-neutral-300">—</span> },
    ];

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view investor growth history.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <Link to="/cash-management/investors" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Investors
                </Link>
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Investor Growth History</h1>
                <p className="text-neutral-500 mt-1">
                    Every monthly compounding entry ever posted, across all investors — informational only, never used for withdrawal validation.
                </p>
            </div>

            <div className="flex gap-4">
                <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
                    {showFilters ? 'Hide Filters' : 'Show Filters'}
                </Button>
                {Object.keys(filters).length > 0 && (
                    <Button variant="secondary" onClick={handleResetFilters}>Clear Filters</Button>
                )}
            </div>
            {showFilters && (
                <FilterBar filters={filterConfig} onApply={handleApplyFilters} onReset={handleResetFilters} />
            )}

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : entries.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">📈</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Growth Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                        Monthly growth entries appear automatically for investors with a growth rate set.
                    </p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={entries} onRowClick={handleRowClick} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}
        </div>
    );
};

export default InvestorGrowthHistoryPage;
