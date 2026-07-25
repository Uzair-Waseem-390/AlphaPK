import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAssetCategories } from '../../hooks/useAssets';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import Pagination from '../../components/ui/Pagination';

const methodBadge = (method) => {
    if (method === 'depreciation') return <Badge variant="warning" size="sm">Depreciation</Badge>;
    if (method === 'revaluation') return <Badge variant="info" size="sm">Revaluation</Badge>;
    return <Badge size="sm">None</Badge>;
};

const AssetCategoriesPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const {
        data: categories, meta, page, setPage, loading,
        refetch, create, update,
    } = useAssetCategories();

    const [showModal, setShowModal] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [formData, setFormData] = useState({ name: '', valuation_method: 'depreciation', depreciation_rate: '' });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');

    const resetForm = () => {
        setFormData({ name: '', valuation_method: 'depreciation', depreciation_rate: '' });
        setEditingCategory(null);
        setFormError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormLoading(true);
        try {
            if (editingCategory) {
                const payload = { name: formData.name };
                if (editingCategory.valuation_method === 'depreciation') {
                    payload.depreciation_rate = parseFloat(formData.depreciation_rate) / 100;
                }
                await update(editingCategory.id, payload);
            } else {
                const payload = { name: formData.name, valuation_method: formData.valuation_method };
                if (formData.valuation_method === 'depreciation') {
                    payload.depreciation_rate = parseFloat(formData.depreciation_rate) / 100;
                }
                await create(payload);
            }
            setShowModal(false);
            resetForm();
            refetch();
        } catch (error) {
            setFormError(error.response?.data?.detail || error.response?.data?.name?.[0] || error.response?.data?.depreciation_rate?.[0] || 'Failed to save category');
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = (category) => {
        setEditingCategory(category);
        setFormData({
            name: category.name,
            valuation_method: category.valuation_method,
            depreciation_rate: category.valuation_method === 'depreciation'
                ? (parseFloat(category.depreciation_rate) * 100).toString()
                : '',
        });
        setShowModal(true);
    };

    const columns = [
        { key: 'name', label: 'Name' },
        { key: 'valuation_method', label: 'Method', render: (v) => methodBadge(v) },
        {
            key: 'depreciation_rate',
            label: 'Rate',
            render: (v, row) => row.valuation_method === 'depreciation'
                ? `${(parseFloat(v) * 100).toFixed(2)}%`
                : <span className="text-neutral-300">—</span>,
        },
        {
            key: 'actions',
            label: 'Actions',
            width: '100px',
            render: (_v, row) => (
                <button onClick={() => handleEdit(row)} className="text-primary-600 hover:text-primary-700 text-sm">
                    Edit
                </button>
            ),
        },
    ];

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view asset categories.</p>
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
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Asset Categories</h1>
                    <p className="text-neutral-500 mt-1">
                        The valuation method (Depreciation/Revaluation/None) is locked once a category is created —
                        only the name and rate can be changed later.
                    </p>
                </div>
                <Button onClick={() => { resetForm(); setShowModal(true); }}>Add Category</Button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : categories.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">🏷️</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Categories Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">Add one to start registering assets.</p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={categories} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}

            <Modal
                isOpen={showModal}
                onClose={() => { setShowModal(false); resetForm(); }}
                title={editingCategory ? 'Edit Category' : 'Add Category'}
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. Furniture & Fixtures"
                        required
                    />

                    {editingCategory ? (
                        <div>
                            <p className="text-sm font-medium text-neutral-700 mb-1.5">Valuation Method</p>
                            <p className="text-sm text-neutral-500">{methodBadge(editingCategory.valuation_method)} — cannot be changed</p>
                        </div>
                    ) : (
                        <Select
                            label="Valuation Method"
                            value={formData.valuation_method}
                            onChange={(e) => setFormData({ ...formData, valuation_method: e.target.value })}
                            options={[
                                { value: 'depreciation', label: 'Depreciation — wears out over time (reducing balance)' },
                                { value: 'revaluation', label: 'Revaluation — value set manually (e.g. Land)' },
                                { value: 'none', label: 'None — never changes' },
                            ]}
                            required
                        />
                    )}

                    {formData.valuation_method === 'depreciation' && (
                        <Input
                            label="Annual Depreciation Rate (%)"
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="100"
                            value={formData.depreciation_rate}
                            onChange={(e) => setFormData({ ...formData, depreciation_rate: e.target.value })}
                            placeholder="e.g. 15 for FBR furniture/vehicles, 30 for computers"
                            required
                        />
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
                            {editingCategory ? 'Update Category' : 'Create Category'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default AssetCategoriesPage;
