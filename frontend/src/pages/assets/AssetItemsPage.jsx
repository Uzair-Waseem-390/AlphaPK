import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAssets, useAssetStats } from '../../hooks/useAssets';
import { assetsApi } from '../../services/assetsApi';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import FilterBar from '../../components/ui/FilterBar';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const AssetItemsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const {
        data: assets, meta, page, setPage, loading,
        filters, setFilters, refetch, create,
    } = useAssets();
    const { refetch: refetchStats } = useAssetStats();

    const [categories, setCategories] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        name: '', category: '', acquisition_type: 'existing',
        cost: '', acquisition_date: new Date().toISOString().split('T')[0], note: '',
    });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        assetsApi.categories.getAll({ page_size: 500 }).then((res) => {
            setCategories(res?.results ?? res ?? []);
        });
    }, []);

    const resetForm = () => {
        setFormData({
            name: '', category: '', acquisition_type: 'existing',
            cost: '', acquisition_date: new Date().toISOString().split('T')[0], note: '',
        });
        setFormError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormLoading(true);
        try {
            await create({ ...formData, category: parseInt(formData.category), cost: parseFloat(formData.cost) });
            setShowModal(false);
            resetForm();
            refetch();
            refetchStats();
        } catch (error) {
            setFormError(error.response?.data?.detail || error.response?.data?.cost?.[0] || 'Failed to register asset');
        } finally {
            setFormLoading(false);
        }
    };

    const handleApplyFilters = (values) => setFilters(values);
    const handleResetFilters = () => setFilters({});
    const handleRowClick = (row) => navigate(`/assets/items/${row.id}`);

    const filterConfig = [
        { name: 'category_id', label: 'Category', type: 'select', options: [
            { value: '', label: 'All' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
        ] },
        { name: 'acquisition_type', label: 'Acquisition', type: 'select', options: [
            { value: '', label: 'All' },
            { value: 'existing', label: 'Existing' },
            { value: 'new', label: 'New' },
        ] },
        { name: 'is_disposed', label: 'Status', type: 'select', options: [
            { value: '', label: 'All' },
            { value: 'false', label: 'Active' },
            { value: 'true', label: 'Disposed' },
        ] },
    ];

    const columns = [
        { key: 'name', label: 'Name' },
        { key: 'category_name', label: 'Category' },
        {
            key: 'acquisition_type',
            label: 'Acquisition',
            render: (v) => v === 'new'
                ? <Badge variant="info" size="sm">New</Badge>
                : <Badge size="sm">Existing</Badge>,
        },
        { key: 'cost', label: 'Cost (PKR)', render: (v) => `Rs. ${fmt(v)}` },
        {
            key: 'current_worth',
            label: 'Current Worth (PKR)',
            render: (v) => <span className="font-semibold text-purple-600">Rs. {fmt(v)}</span>,
        },
        { key: 'acquisition_date', label: 'Date', render: (v) => new Date(v).toLocaleDateString() },
        {
            key: 'is_disposed',
            label: 'Status',
            render: (v) => v
                ? <Badge variant="error" size="sm">Disposed</Badge>
                : <Badge variant="success" size="sm">Active</Badge>,
        },
    ];

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view assets.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <Link to="/assets" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Assets
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Assets</h1>
                    <p className="text-neutral-500 mt-1">Every registered fixed asset</p>
                </div>
                <Button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    disabled={categories.length === 0}
                >
                    Add Asset
                </Button>
            </div>

            {categories.length === 0 && !loading && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    Create an <Link to="/assets/categories" className="underline font-medium">asset category</Link> first before registering an asset.
                </div>
            )}

            <div className="space-y-4">
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
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : assets.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">📦</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Assets Registered Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">Add one to start tracking its worth over time.</p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={assets} onRowClick={handleRowClick} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}

            <Modal
                isOpen={showModal}
                onClose={() => { setShowModal(false); resetForm(); }}
                title="Add Asset"
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. Delivery Bike, Front Shelving"
                        required
                    />
                    <Select
                        label="Category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        options={categories.map((c) => ({ value: c.id, label: `${c.name} (${c.valuation_method})` }))}
                        required
                    />
                    <Select
                        label="Acquisition Type"
                        value={formData.acquisition_type}
                        onChange={(e) => setFormData({ ...formData, acquisition_type: e.target.value })}
                        options={[
                            { value: 'existing', label: 'Existing — already owned, no cash movement' },
                            { value: 'new', label: 'New — purchased now, deducts cash in hand' },
                        ]}
                        required
                    />
                    <Input
                        label="Cost (PKR)"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={formData.cost}
                        onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                        required
                    />
                    <Input
                        label={formData.acquisition_type === 'existing' ? 'Original Acquisition Date' : 'Purchase Date'}
                        type="date"
                        value={formData.acquisition_date}
                        onChange={(e) => setFormData({ ...formData, acquisition_date: e.target.value })}
                        required
                    />
                    <Input
                        label="Note"
                        value={formData.note}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        placeholder="Optional"
                    />

                    {formData.acquisition_type === 'existing' ? (
                        <div className="p-3 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-700">
                                ℹ️ No cash movement. The system will back-fill depreciation history from the acquisition date to today automatically.
                            </p>
                        </div>
                    ) : (
                        formData.cost && parseFloat(formData.cost) > 0 && (
                            <div className="p-3 bg-amber-50 rounded-lg">
                                <p className="text-sm text-amber-700">
                                    ⚠️ This will deduct <strong>Rs. {fmt(formData.cost)}</strong> from cash in hand.
                                </p>
                            </div>
                        )
                    )}

                    {formError && (
                        <div className="p-3 bg-error-50 border border-error-200 rounded-lg">
                            <p className="text-sm text-error-600">{formError}</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={formLoading}>
                            Register Asset
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default AssetItemsPage;
