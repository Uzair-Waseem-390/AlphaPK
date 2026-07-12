import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import { ratesApi } from '../../services/ratesApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import Card from '../ui/Card';
import Button from '../ui/Button';
import SearchBar from '../ui/SearchBar';
import Select from '../ui/Select';
import LoadingSpinner from '../ui/LoadingSpinner';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import Pagination from '../ui/Pagination';
import { Link } from 'react-router-dom';

const NormalUserDashboard = () => {
    const { user } = useAuth();
    const [rates, setRates] = useState([]);
    const [ratesLoading, setRatesLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [shelfFilter, setShelfFilter] = useState('');
    const [categories, setCategories] = useState([]);
    const [shelves, setShelves] = useState([]);
    const [activeTab, setActiveTab] = useState('inventory');

    // Search/category/shelf are routed through query params — the backend
    // supports search/category/shelf on this endpoint — so the table itself
    // stays correctly paginated instead of filtering a client-side array.
    const fetchInventoryPage = (params) => {
        const p = { ...params };
        if (searchTerm) p.search = searchTerm;
        if (categoryFilter) p.category = categoryFilter;
        if (shelfFilter) p.shelf = shelfFilter;
        return purchasesApi.inventory.getAll(p);
    };

    const {
        data: inventory, meta, extra, page, setPage, loading: inventoryLoading,
    } = usePaginatedList(fetchInventoryPage, {}, 25, [searchTerm, categoryFilter, shelfFilter]);

    useEffect(() => {
        loadLookupsAndRates();
    }, []);

    const loadLookupsAndRates = async () => {
        setRatesLoading(true);
        try {
            // Normal users have no Purchases app access, so category/shelf
            // filter options are derived from a full (page_size:500) inventory
            // fetch rather than calling purchasesApi.categories/shelves
            // (admin-only) — kept separate from the paginated table fetch.
            const [fullInventoryData, ratesData] = await Promise.all([
                purchasesApi.inventory.getAll({ page_size: 500 }),
                ratesApi.getAll(),
            ]);
            const fullInventory = fullInventoryData?.results || fullInventoryData || [];
            setRates(ratesData?.results || ratesData || []);

            const categoryMap = new Map();
            const shelfMap = new Map();
            fullInventory.forEach(item => {
                const category = item.product?.category;
                const shelf = item.product?.shelf;
                if (category?.id) categoryMap.set(category.id, category);
                if (shelf?.id) shelfMap.set(shelf.id, shelf);
            });
            setCategories([...categoryMap.values()]);
            setShelves([...shelfMap.values()]);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setRatesLoading(false);
        }
    };

    // Summary stats are computed server-side over the full filtered set
    // (not just the current page) and passed through as an extra field.
    const totalProducts = extra?.stats?.total_products ?? 0;
    const lowStockItems = extra?.stats?.low_stock ?? 0;
    const outOfStockItems = extra?.stats?.out_of_stock ?? 0;

    const loading = ratesLoading || inventoryLoading;

    const inventoryColumns = [
        { key: 'product', label: 'Code', render: (value) => value?.code || 'N/A' },
        { key: 'product', label: 'Name', render: (value) => value?.name || 'N/A' },
        { key: 'product', label: 'Category', render: (value) => value?.category?.name || 'N/A' },
        { key: 'product', label: 'Shelf', render: (value) => value?.shelf?.name || 'N/A' },
        {
            key: 'quantity',
            label: 'Quantity',
            render: (value) => {
                const num = typeof value === 'string' ? parseFloat(value) : value;
                return (
                    <span className={`font-semibold ${num <= 0 ? 'text-error-600' : num <= 5 ? 'text-warning-600' : 'text-success-600'}`}>
                        {isNaN(num) ? '0' : num}
                    </span>
                );
            }
        },
    ];

    const ratesColumns = [
        { key: 'product', label: 'Code', render: (value) => value?.code || 'N/A' },
        { key: 'product', label: 'Name', render: (value) => value?.name || 'N/A' },
        { key: 'product', label: 'Category', render: (value) => value?.category?.name || 'N/A' },
        { key: 'product', label: 'Shelf', render: (value) => value?.shelf?.name || 'N/A' },
        {
            key: 'rate',
            label: 'Selling Price',
            render: (value) => {
                if (!value) return <Badge variant="error">No price set</Badge>;
                return <span className="font-semibold text-primary-600">{parseFloat(value.selling_price).toFixed(2)}</span>;
            }
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
            {/* Welcome Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-primary-600 to-indigo-600 rounded-2xl p-6 text-white"
            >
                <h1 className="text-2xl font-bold">
                    Welcome back, {user?.first_name} {user?.last_name}!
                </h1>
                <div className="flex items-center gap-2 mt-1">
                    <Badge variant="info" className="bg-white/20 text-white">User</Badge>
                    <span className="text-white/80 text-sm">View-only access</span>
                </div>
            </motion.div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4">
                    <p className="text-sm text-neutral-500">Total Products</p>
                    <p className="text-2xl font-bold text-neutral-900">{totalProducts}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-neutral-500">Low Stock (≤ 5)</p>
                    <p className="text-2xl font-bold text-warning-600">{lowStockItems}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-neutral-500">Out of Stock</p>
                    <p className="text-2xl font-bold text-error-600">{outOfStockItems}</p>
                </Card>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-neutral-200">
                <button
                    onClick={() => setActiveTab('inventory')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all ${activeTab === 'inventory'
                            ? 'text-primary-600 border-b-2 border-primary-600'
                            : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                        }`}
                >
                    📦 Inventory
                </button>
                <button
                    onClick={() => setActiveTab('rates')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all ${activeTab === 'rates'
                            ? 'text-primary-600 border-b-2 border-primary-600'
                            : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                        }`}
                >
                    💰 Rates
                </button>
            </div>

            {/* Inventory Tab */}
            {activeTab === 'inventory' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-4">
                        <SearchBar
                            onSearch={(value) => { setSearchTerm(value); setPage(1); }}
                            placeholder="Search by name or code..."
                            className="flex-1 min-w-[200px]"
                        />
                        <Select
                            value={categoryFilter}
                            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                            options={[
                                { value: '', label: 'All Categories' },
                                ...categories.map(c => ({ value: c.id, label: c.name })),
                            ]}
                            className="w-48"
                        />
                        <Select
                            value={shelfFilter}
                            onChange={(e) => { setShelfFilter(e.target.value); setPage(1); }}
                            options={[
                                { value: '', label: 'All Shelves' },
                                ...shelves.map(s => ({ value: s.id, label: s.name })),
                            ]}
                            className="w-48"
                        />
                    </div>
                    <Table columns={inventoryColumns} data={inventory} />
                    {meta.totalPages > 1 && (
                        <Pagination
                            currentPage={meta.currentPage}
                            totalPages={meta.totalPages}
                            onPageChange={setPage}
                        />
                    )}
                </div>
            )}

            {/* Rates Tab */}
            {activeTab === 'rates' && (
                <div className="space-y-4">
                    <p className="text-sm text-neutral-500">View current selling prices (read-only)</p>
                    <Table columns={ratesColumns} data={rates} />
                </div>
            )}
        </div>
    );
};

export default NormalUserDashboard;