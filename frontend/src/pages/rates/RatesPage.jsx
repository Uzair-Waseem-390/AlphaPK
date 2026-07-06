import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useRates } from '../../hooks/useRates';
import { purchasesApi } from '../../services/purchasesApi';
import RateTable from '../../components/rates/RateTable';
import RateFormModal from '../../components/rates/RateFormModal';
import SearchBar from '../../components/ui/SearchBar';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useNavigate } from 'react-router-dom';

const RatesPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
    const navigate = useNavigate();

    const { data, loading, filters, setFilters, create, update, refetch } = useRates();
    const [categories, setCategories] = useState([]);
    const [shelves, setShelves] = useState([]);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [selectedRate, setSelectedRate] = useState(null);
    const [formLoading, setFormLoading] = useState(false);

    useEffect(() => {
        loadLookups();
    }, []);

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

    const handleSearch = (value) => {
        setFilters(prev => ({ ...prev, search: value }));
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleResetFilters = () => {
        setFilters({});
    };

    const handleEdit = (product, rate) => {
        setSelectedProduct(product);
        setSelectedRate(rate || null);
        setShowModal(true);
    };

    const handleViewHistory = (product) => {
        navigate(`/rates/history/${product.id}`);
    };

    const handleSubmit = async (formData) => {
        setFormLoading(true);
        try {
            if (selectedRate) {
                // Update existing rate
                await update(selectedRate.id, {
                    selling_price: formData.selling_price,
                    note: formData.note,
                });
            } else {
                // Create new rate
                await create({
                    product_id: selectedProduct.id,
                    selling_price: formData.selling_price,
                    note: formData.note,
                });
            }
            setShowModal(false);
            setSelectedProduct(null);
            setSelectedRate(null);
        } catch (error) {
            console.error('Failed to save rate:', error);
            alert(error.response?.data?.detail || 'Failed to save rate');
        } finally {
            setFormLoading(false);
        }
    };

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
                <h1 className="text-3xl font-bold text-neutral-900">Product Rates</h1>
                <p className="text-neutral-500 mt-1">
                    Manage selling prices for all products
                </p>
                <p className="text-sm text-neutral-400 mt-1">
                    {isAdmin ? 'Admin users can set and edit prices' : 'View-only mode'}
                </p>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <SearchBar
                    onSearch={handleSearch}
                    placeholder="Search by product name or code..."
                    className="flex-1"
                />
                <Select
                    value={filters.category || ''}
                    onChange={(e) => handleFilterChange('category', e.target.value)}
                    options={[
                        { value: '', label: 'All Categories' },
                        ...categories.map(c => ({ value: c.id, label: c.name })),
                    ]}
                    className="w-48"
                />
                <Select
                    value={filters.shelf || ''}
                    onChange={(e) => handleFilterChange('shelf', e.target.value)}
                    options={[
                        { value: '', label: 'All Shelves' },
                        ...shelves.map(s => ({ value: s.id, label: s.name })),
                    ]}
                    className="w-48"
                />
                <input
                    type="number"
                    placeholder="Min Price"
                    value={filters.min_price || ''}
                    onChange={(e) => handleFilterChange('min_price', e.target.value)}
                    className="px-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all w-32"
                />
                <input
                    type="number"
                    placeholder="Max Price"
                    value={filters.max_price || ''}
                    onChange={(e) => handleFilterChange('max_price', e.target.value)}
                    className="px-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all w-32"
                />
                {(Object.keys(filters).length > 0) && (
                    <button
                        onClick={handleResetFilters}
                        className="px-4 py-2.5 bg-neutral-100 text-neutral-700 rounded-xl hover:bg-neutral-200 transition-colors"
                    >
                        Clear Filters
                    </button>
                )}
            </div>

            {/* Rate Table */}
            <RateTable
                rates={data}
                isAdmin={isAdmin}
                onEdit={handleEdit}
                onViewHistory={handleViewHistory}
                loading={loading}
            />

            {/* Rate Form Modal */}
            <RateFormModal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    setSelectedProduct(null);
                    setSelectedRate(null);
                }}
                onSubmit={handleSubmit}
                product={selectedProduct}
                existingRate={selectedRate}
                loading={formLoading}
            />
        </div>
    );
};

export default RatesPage;