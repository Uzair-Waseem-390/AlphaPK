import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAssetDisposals } from '../../hooks/useAssets';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import FilterBar from '../../components/ui/FilterBar';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const AssetDisposalsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const {
        data: disposals, meta, page, setPage, loading, filters, setFilters,
    } = useAssetDisposals();

    const [showFilters, setShowFilters] = useState(false);

    const handleApplyFilters = (values) => setFilters(values);
    const handleResetFilters = () => setFilters({});
    const handleRowClick = (row) => navigate(`/assets/items/${row.asset}`);

    const filterConfig = [
        { name: 'disposal_type', label: 'Type', type: 'select', options: [
            { value: '', label: 'All' },
            { value: 'scrapped', label: 'Scrapped' },
            { value: 'sold', label: 'Sold' },
        ] },
    ];

    const columns = [
        { key: 'disposal_date', label: 'Date', render: (v) => new Date(v).toLocaleDateString() },
        { key: 'asset_name', label: 'Asset' },
        {
            key: 'disposal_type',
            label: 'Type',
            render: (v) => v === 'sold'
                ? <Badge variant="info" size="sm">Sold</Badge>
                : <Badge variant="warning" size="sm">Scrapped</Badge>,
        },
        { key: 'worth_at_disposal', label: 'Worth at Disposal', render: (v) => `Rs. ${fmt(v)}` },
        { key: 'sale_amount', label: 'Sale Amount', render: (v) => v != null ? `Rs. ${fmt(v)}` : <span className="text-neutral-300">—</span> },
        {
            key: 'gain_loss',
            label: 'Gain / Loss',
            render: (v) => v == null
                ? <span className="text-neutral-300">—</span>
                : (
                    <span className={parseFloat(v) >= 0 ? 'text-success-600 font-semibold' : 'text-error-600 font-semibold'}>
                        {parseFloat(v) >= 0 ? '+' : ''}Rs. {fmt(v)}
                    </span>
                ),
        },
        { key: 'reason', label: 'Reason', render: (v) => v || <span className="text-neutral-300">—</span> },
    ];

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view asset disposals.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <Link to="/assets" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Assets
                </Link>
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Asset Disposals</h1>
                <p className="text-neutral-500 mt-1">Audit trail of every asset that's been scrapped or sold</p>
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
            ) : disposals.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">🗑️</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Disposals Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">Disposed assets will appear here.</p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={disposals} onRowClick={handleRowClick} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}
        </div>
    );
};

export default AssetDisposalsPage;
