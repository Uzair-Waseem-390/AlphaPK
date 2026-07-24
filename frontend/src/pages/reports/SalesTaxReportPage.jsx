import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { reportsApi } from '../../services/reportsApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import FilterBar from '../../components/ui/FilterBar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const filterConfig = [
    { name: 'date',      label: 'Exact Date', type: 'date' },
    { name: 'date_from', label: 'Date From',  type: 'date' },
    { name: 'date_to',   label: 'Date To',    type: 'date' },
];

const inputColumns = [
    { key: 'order_number', label: 'Order #', render: (v) => <span className="font-mono text-sm font-medium text-neutral-800">{v}</span> },
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'supplier_code', label: 'Code', render: (v) => <span className="font-mono text-xs text-neutral-500">{v}</span> },
    { key: 'gst_total', label: 'GST Paid (PKR)', render: (v) => <span className="font-semibold text-info-600">Rs. {fmt(v)}</span> },
    { key: 'wht_total', label: 'WHT Withheld (PKR)', render: (v) => `Rs. ${fmt(v)}` },
    { key: 'net_payable', label: 'Net Payable (PKR)', render: (v) => `Rs. ${fmt(v)}` },
    { key: 'confirmed_at', label: 'Date', render: (v) => v ? new Date(v).toLocaleDateString() : 'N/A' },
];

const outputColumns = [
    { key: 'bill_number', label: 'Bill #', render: (v) => <span className="font-mono text-sm font-medium text-neutral-800">{v}</span> },
    { key: 'customer_name', label: 'Customer' },
    { key: 'customer_code', label: 'Code', render: (v) => <span className="font-mono text-xs text-neutral-500">{v}</span> },
    { key: 'gst_total', label: 'GST Collected (PKR)', render: (v) => <span className="font-semibold text-purple-600">Rs. {fmt(v)}</span> },
    { key: 'wht_total', label: 'WHT Withheld (PKR)', render: (v) => `Rs. ${fmt(v)}` },
    { key: 'grand_total', label: 'Grand Total (PKR)', render: (v) => `Rs. ${fmt(v)}` },
    { key: 'confirmed_at', label: 'Date', render: (v) => v ? new Date(v).toLocaleDateString() : 'N/A' },
];

const SalesTaxReportPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [activeTab, setActiveTab] = useState('input'); // 'input' | 'output'
    const [showFilters, setShowFilters] = useState(false);

    const fetchPage = (params) =>
        activeTab === 'input' ? reportsApi.salesTaxInput.get(params) : reportsApi.salesTaxOutput.get(params);

    const {
        data: results, meta, extra, page, setPage, loading, error,
        filters, setFilters,
    } = usePaginatedList(fetchPage, {}, 25, [activeTab]);

    const stats = extra?.stats;

    if (!isAdmin) {
        navigate('/dashboard');
        return null;
    }

    const handleApplyFilters = (values) => setFilters(values);
    const handleResetFilters = () => setFilters({});
    const switchTab = (tab) => {
        setActiveTab(tab);
        setFilters({});
        setPage(1);
    };

    const columns = activeTab === 'input' ? inputColumns : outputColumns;

    return (
        <div className="space-y-6">
            <div>
                <Link to="/reports" className="text-sm text-primary-600 hover:text-primary-700">
                    ← Back to Reports
                </Link>
                <h1 className="text-3xl font-bold text-neutral-900 mt-1">Sales Tax Report</h1>
                <p className="text-neutral-500 mt-1">
                    Input Tax (GST paid to suppliers) vs Output Tax (GST charged to customers) — see{' '}
                    <Link to="/taxes" className="text-primary-600 hover:text-primary-700">Taxes</Link> for the
                    net payable summary and to record payments.
                </p>
            </div>

            <div className="flex gap-2 border-b border-neutral-200">
                <button
                    onClick={() => switchTab('input')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'input'
                            ? 'border-primary-600 text-primary-600'
                            : 'border-transparent text-neutral-500 hover:text-neutral-700'
                    }`}
                >
                    Input Tax (Purchases)
                </button>
                <button
                    onClick={() => switchTab('output')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'output'
                            ? 'border-primary-600 text-primary-600'
                            : 'border-transparent text-neutral-500 hover:text-neutral-700'
                    }`}
                >
                    Output Tax (Sales)
                </button>
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
                    {stats && activeTab === 'input' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Card className="p-4">
                                <p className="text-xs text-neutral-500 mb-1">Total Orders</p>
                                <p className="text-2xl font-bold text-neutral-900">{stats.total_orders ?? 0}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-xs text-neutral-500 mb-1">Total Input Tax Paid (PKR)</p>
                                <p className="text-2xl font-bold text-info-600">Rs. {fmt(stats.total_input_tax_paid)}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-xs text-neutral-500 mb-1">Total WHT Withheld (PKR)</p>
                                <p className="text-2xl font-bold text-orange-600">Rs. {fmt(stats.total_wht_withheld)}</p>
                            </Card>
                        </div>
                    )}
                    {stats && activeTab === 'output' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Card className="p-4">
                                <p className="text-xs text-neutral-500 mb-1">Total Invoices</p>
                                <p className="text-2xl font-bold text-neutral-900">{stats.total_invoices ?? 0}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-xs text-neutral-500 mb-1">Total Output Tax Collected (PKR)</p>
                                <p className="text-2xl font-bold text-purple-600">Rs. {fmt(stats.total_output_tax_collected)}</p>
                            </Card>
                            <Card className="p-4">
                                <p className="text-xs text-neutral-500 mb-1">Total WHT Withheld (PKR)</p>
                                <p className="text-2xl font-bold text-orange-600">Rs. {fmt(stats.total_wht_withheld)}</p>
                            </Card>
                        </div>
                    )}

                    {results.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4">🧮</div>
                            <h3 className="text-lg font-semibold text-neutral-900">No Records Found</h3>
                            <p className="text-sm text-neutral-500 mt-1">Try adjusting your date filters</p>
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

export default SalesTaxReportPage;
