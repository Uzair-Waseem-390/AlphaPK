import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import Table from '../../components/ui/Table';
import SearchBar from '../../components/ui/SearchBar';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import FilterBar from '../../components/ui/FilterBar';
import Pagination from '../../components/ui/Pagination';

const InventoryPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [searchTerm, setSearchTerm] = useState('');
    const [categories, setCategories] = useState([]);
    const [shelves, setShelves] = useState([]);
    const [showFilters, setShowFilters] = useState(false);
    const [totalStock, setTotalStock] = useState(0);

    // Detail modal state
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [productDetail, setProductDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Search is routed through the same query params as category/shelf
    // filters — the backend supports search/category/shelf on this endpoint.
    const fetchInventoryPage = (params) => {
        const p = { ...params };
        if (searchTerm) p.search = searchTerm;
        return purchasesApi.inventory.getAll(p);
    };

    const {
        data: inventory, meta, extra, page, setPage, loading,
        filters, setFilters,
    } = usePaginatedList(fetchInventoryPage, {}, 25, [searchTerm]);

    useEffect(() => {
        loadLookups();
    }, []);

    // "Total Stock" (sum of quantity across the full filtered set) has no
    // backend stats equivalent (the stats block only has total_products /
    // low_stock / out_of_stock), so it's computed from a dedicated
    // page_size:500 fetch mirroring the same filters — same workaround
    // pattern used elsewhere for "need the full list, not just one page".
    useEffect(() => {
        let cancelled = false;
        const computeTotalStock = async () => {
            try {
                const params = { ...filters, page_size: 500 };
                if (searchTerm) params.search = searchTerm;
                const res = await purchasesApi.inventory.getAll(params);
                const items = res?.results || res || [];
                const sum = items.reduce((s, item) => s + (parseFloat(item.quantity) || 0), 0);
                if (!cancelled) setTotalStock(sum);
            } catch (error) {
                if (!cancelled) setTotalStock(0);
            }
        };
        computeTotalStock();
        return () => { cancelled = true; };
    }, [filters, searchTerm]);

    const loadLookups = async () => {
        try {
            // page_size override — dropdown needs every category/shelf, not
            // just one paginated page of them.
            const [catsRes, shelvesRes] = await Promise.all([
                purchasesApi.categories.getAll({ page_size: 500 }),
                purchasesApi.shelves.getAll({ page_size: 500 }),
            ]);
            const cats = catsRes?.results || catsRes || [];
            const shelvesList = shelvesRes?.results || shelvesRes || [];
            setCategories(cats.filter(c => !c.is_deleted));
            setShelves(shelvesList.filter(s => !s.is_deleted));
        } catch (error) {
            console.error('Failed to load lookups:', error);
        }
    };

    const handleSearch = (value) => {
        setSearchTerm(value);
        setPage(1);
    };

    const handleApplyFilters = (filterValues) => {
        setFilters(filterValues);
    };

    const handleResetFilters = () => {
        setFilters({});
        setSearchTerm('');
    };

    const filterConfig = [
        {
            name: 'category',
            label: 'Category',
            type: 'select',
            options: categories.map(c => ({ value: c.id, label: c.name })),
        },
        {
            name: 'shelf',
            label: 'Shelf',
            type: 'select',
            options: shelves.map(s => ({ value: s.id, label: s.name })),
        },
    ];

    const handleRowClick = async (row) => {
        // Get the product ID from the row
        const productId = row.product?.id;
        if (!productId) return;

        setSelectedProduct(row);
        setShowDetailModal(true);
        setDetailLoading(true);
        try {
            const detail = await purchasesApi.inventory.getByProduct(productId);
            setProductDetail(detail);
        } catch (error) {
            console.error('Failed to fetch product details:', error);
            setProductDetail(null);
        } finally {
            setDetailLoading(false);
        }
    };

    // Summary stats are computed server-side over the full filtered set
    // (not just the current page) and passed through as an extra field.
    const totalProducts = extra?.stats?.total_products ?? 0;
    const lowStockItems = extra?.stats?.low_stock ?? 0;
    const outOfStockItems = extra?.stats?.out_of_stock ?? 0;

    const columns = [
        {
            key: 'product',
            label: 'Product Code',
            render: (value) => value?.code || 'N/A'
        },
        {
            key: 'product',
            label: 'Product Name',
            render: (value) => value?.name || 'N/A'
        },
        {
            key: 'product',
            label: 'Category',
            render: (value) => value?.category?.name || 'N/A'
        },
        {
            key: 'product',
            label: 'Shelf',
            render: (value) => value?.shelf?.name || 'N/A'
        },
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">Inventory</h1>
                    <p className="text-neutral-500 mt-1">View current inventory levels across all products</p>
                    <p className="text-sm text-neutral-400 mt-1">Click on any row to view detailed product information</p>
                </div>
                {isAdmin && (
                    <Button
                        onClick={() => navigate('/purchases/lost-inventory')}
                        icon={({ className }) => (
                            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        )}
                    >
                        Manage Inventory
                    </Button>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                    <p className="text-sm text-neutral-500">Total Products</p>
                    <p className="text-2xl font-bold text-neutral-900">{totalProducts}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-neutral-500">Total Stock</p>
                    <p className="text-2xl font-bold text-neutral-900">{totalStock}</p>
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

            {/* Filters */}
            <div className="space-y-4">
                <div className="flex gap-4">
                    <div className="flex-1">
                        <SearchBar
                            onSearch={handleSearch}
                            placeholder="Search products by name or code..."
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

            {/* Inventory Table */}
            <Table
                columns={columns}
                data={inventory}
                onRowClick={handleRowClick}
            />

            {meta.totalPages > 1 && (
                <Pagination
                    currentPage={meta.currentPage}
                    totalPages={meta.totalPages}
                    onPageChange={setPage}
                />
            )}

            {inventory.length === 0 && !loading && (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">📦</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Inventory Found</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                        Try adjusting your search or filters
                    </p>
                </div>
            )}

            {/* Inventory Detail Modal */}
            <Modal
                isOpen={showDetailModal}
                onClose={() => {
                    setShowDetailModal(false);
                    setSelectedProduct(null);
                    setProductDetail(null);
                }}
                title="Product Details"
                size="lg"
            >
                {detailLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : productDetail ? (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-neutral-500">Product Name</p>
                                <p className="font-medium">{productDetail.product?.name || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Product Code</p>
                                <p className="font-medium">{productDetail.product?.code || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Category</p>
                                <p className="font-medium">{productDetail.product?.category?.name || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Shelf</p>
                                <p className="font-medium">{productDetail.product?.shelf?.name || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Current Quantity</p>
                                <p className={`text-xl font-bold ${productDetail.quantity <= 0 ? 'text-error-600' :
                                        productDetail.quantity <= 5 ? 'text-warning-600' : 'text-success-600'
                                    }`}>
                                    {productDetail.quantity || 0}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Status</p>
                                <Badge variant={
                                    productDetail.quantity <= 0 ? 'error' :
                                        productDetail.quantity <= 5 ? 'warning' : 'success'
                                }>
                                    {productDetail.quantity <= 0 ? 'Out of Stock' :
                                        productDetail.quantity <= 5 ? 'Low Stock' : 'In Stock'}
                                </Badge>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Last Updated</p>
                                <p className="font-medium">
                                    {productDetail.last_updated_at ? new Date(productDetail.last_updated_at).toLocaleString() : 'N/A'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-neutral-500">Last Updated By</p>
                                <p className="font-medium">{productDetail.last_updated_by || 'N/A'}</p>
                            </div>
                        </div>

                        {productDetail.product?.description && (
                            <div>
                                <p className="text-sm text-neutral-500">Description</p>
                                <p className="font-medium">{productDetail.product.description}</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <p className="text-neutral-500">No product details available</p>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default InventoryPage;