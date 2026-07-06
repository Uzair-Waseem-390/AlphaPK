import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { purchasesApi } from '../../services/purchasesApi';
import Table from '../../components/ui/Table';
import SearchBar from '../../components/ui/SearchBar';
import Select from '../../components/ui/Select';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';

const InventoryPage = () => {
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({});
    const [categories, setCategories] = useState([]);
    const [shelves, setShelves] = useState([]);

    useEffect(() => {
        loadLookups();
        fetchInventory();
    }, [filters]);

    const loadLookups = async () => {
        try {
            const [cats, shelves] = await Promise.all([
                purchasesApi.categories.getAll(),
                purchasesApi.shelves.getAll(),
            ]);
            setCategories(cats.filter(c => !c.is_deleted));
            setShelves(shelves.filter(s => !s.is_deleted));
        } catch (error) {
            console.error('Failed to load lookups:', error);
        }
    };

    const fetchInventory = async () => {
        setLoading(true);
        try {
            const data = await purchasesApi.inventory.getAll(filters);
            setInventory(data);
        } catch (error) {
            console.error('Failed to fetch inventory:', error);
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        { key: 'product_code', label: 'Product Code' },
        { key: 'product_name', label: 'Product Name' },
        {
            key: 'category_name',
            label: 'Category',
            render: (value) => value || 'N/A'
        },
        {
            key: 'shelf_name',
            label: 'Shelf',
            render: (value) => value || 'N/A'
        },
        {
            key: 'quantity',
            label: 'Quantity',
            render: (value) => (
                <span className={`font-semibold ${value <= 0 ? 'text-error-600' : 'text-success-600'}`}>
                    {value}
                </span>
            )
        },
        {
            key: 'last_updated_at',
            label: 'Last Updated',
            render: (value) => value ? new Date(value).toLocaleString() : 'N/A'
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
                <h1 className="text-3xl font-bold text-neutral-900">Inventory</h1>
                <p className="text-neutral-500 mt-1">View current inventory levels</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
                <SearchBar
                    onSearch={(value) => setFilters({ ...filters, search: value })}
                    placeholder="Search products..."
                    className="flex-1"
                />

                <Select
                    value={filters.category || ''}
                    onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                    options={[
                        { value: '', label: 'All Categories' },
                        ...categories.map(c => ({ value: c.id, label: c.name })),
                    ]}
                    className="w-48"
                />

                <Select
                    value={filters.shelf || ''}
                    onChange={(e) => setFilters({ ...filters, shelf: e.target.value })}
                    options={[
                        { value: '', label: 'All Shelves' },
                        ...shelves.map(s => ({ value: s.id, label: s.name })),
                    ]}
                    className="w-48"
                />

                <button
                    onClick={() => {
                        setFilters({});
                        fetchInventory();
                    }}
                    className="px-4 py-2.5 bg-neutral-100 text-neutral-700 rounded-xl hover:bg-neutral-200 transition-colors"
                >
                    Reset
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                    <p className="text-sm text-neutral-500">Total Products</p>
                    <p className="text-2xl font-bold text-neutral-900">{inventory.length}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-neutral-500">Total Stock</p>
                    <p className="text-2xl font-bold text-neutral-900">
                        {inventory.reduce((sum, item) => sum + (item.quantity || 0), 0)}
                    </p>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-neutral-500">Low Stock Items</p>
                    <p className="text-2xl font-bold text-error-600">
                        {inventory.filter(item => (item.quantity || 0) <= 5).length}
                    </p>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-neutral-500">Last Updated</p>
                    <p className="text-sm font-medium text-neutral-900">
                        {inventory.length > 0 ? new Date(Math.max(...inventory.map(i => new Date(i.last_updated_at)))).toLocaleString() : 'N/A'}
                    </p>
                </Card>
            </div>

            <Table
                columns={columns}
                data={inventory}
            />
        </div>
    );
};

export default InventoryPage;