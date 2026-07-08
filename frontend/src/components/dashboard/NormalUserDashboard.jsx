import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import { ratesApi } from '../../services/ratesApi';
import Card from '../ui/Card';
import Button from '../ui/Button';
import SearchBar from '../ui/SearchBar';
import Select from '../ui/Select';
import LoadingSpinner from '../ui/LoadingSpinner';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import { Link } from 'react-router-dom';

const NormalUserDashboard = () => {
    const { user } = useAuth();
    const [inventory, setInventory] = useState([]);
    const [rates, setRates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [shelfFilter, setShelfFilter] = useState('');
    const [categories, setCategories] = useState([]);
    const [shelves, setShelves] = useState([]);
    const [activeTab, setActiveTab] = useState('inventory');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [inventoryData, ratesData, categoriesData, shelvesData] = await Promise.all([
                purchasesApi.inventory.getAll(),
                ratesApi.getAll(),
                purchasesApi.categories.getAll(),
                purchasesApi.shelves.getAll(),
            ]);
            setInventory(inventoryData || []);
            setRates(ratesData || []);
            setCategories(categoriesData.filter(c => !c.is_deleted) || []);
            setShelves(shelvesData.filter(s => !s.is_deleted) || []);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredInventory = inventory.filter(item => {
        let matches = true;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            matches = item.product?.name?.toLowerCase().includes(term) ||
                item.product?.code?.toLowerCase().includes(term);
        }
        if (categoryFilter) {
            matches = matches && item.product?.category?.id === parseInt(categoryFilter);
        }
        if (shelfFilter) {
            matches = matches && item.product?.shelf?.id === parseInt(shelfFilter);
        }
        return matches;
    });

    const totalProducts = inventory.length;
    const lowStockItems = inventory.filter(item => (item.quantity || 0) <= 5 && (item.quantity || 0) > 0).length;
    const outOfStockItems = inventory.filter(item => (item.quantity || 0) <= 0).length;

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
                            onSearch={setSearchTerm}
                            placeholder="Search by name or code..."
                            className="flex-1 min-w-[200px]"
                        />
                        <Select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            options={[
                                { value: '', label: 'All Categories' },
                                ...categories.map(c => ({ value: c.id, label: c.name })),
                            ]}
                            className="w-48"
                        />
                        <Select
                            value={shelfFilter}
                            onChange={(e) => setShelfFilter(e.target.value)}
                            options={[
                                { value: '', label: 'All Shelves' },
                                ...shelves.map(s => ({ value: s.id, label: s.name })),
                            ]}
                            className="w-48"
                        />
                    </div>
                    <Table columns={inventoryColumns} data={filteredInventory} />
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