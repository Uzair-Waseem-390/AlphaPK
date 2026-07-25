import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useInvestors } from '../../hooks/useCashManagement';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Table from '../../components/ui/Table';
import SearchBar from '../../components/ui/SearchBar';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const InvestorsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const {
        data: investors, meta, page, setPage, loading,
        filters, setFilters, refetch, create, update, delete: deleteInvestor,
    } = useInvestors();

    const [showModal, setShowModal] = useState(false);
    const [editingInvestor, setEditingInvestor] = useState(null);
    const [formData, setFormData] = useState({ name: '', contact_number: '', email: '', note: '', growth_rate: '' });
    const [formLoading, setFormLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const resetForm = () => {
        setFormData({ name: '', contact_number: '', email: '', note: '', growth_rate: '' });
        setEditingInvestor(null);
        setFormError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormLoading(true);
        try {
            const payload = { ...formData, growth_rate: (parseFloat(formData.growth_rate) || 0) / 100 };
            if (editingInvestor) {
                await update(editingInvestor.id, payload);
            } else {
                await create(payload);
            }
            setShowModal(false);
            resetForm();
            refetch();
        } catch (error) {
            setFormError(error.response?.data?.detail || error.response?.data?.name?.[0] || error.response?.data?.growth_rate?.[0] || 'Failed to save investor');
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = (investor) => {
        setEditingInvestor(investor);
        setFormData({
            name: investor.name || '',
            contact_number: investor.contact_number || '',
            email: investor.email || '',
            note: investor.note || '',
            growth_rate: investor.growth_rate ? (parseFloat(investor.growth_rate) * 100).toString() : '',
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        try {
            await deleteInvestor(id);
            setDeleteConfirm(null);
            refetch();
        } catch (error) {
            setDeleteConfirm(null);
            alert(error.response?.data?.detail || 'Failed to delete investor');
        }
    };

    const handleSearch = (value) => {
        setSearchTerm(value);
        setFilters({ ...filters, search: value });
    };

    const handleRowClick = (investor) => navigate(`/cash-management/investors/${investor.id}`);

    const columns = [
        { key: 'name', label: 'Name' },
        { key: 'contact_number', label: 'Contact', render: (value) => value || <span className="text-neutral-300">—</span> },
        { key: 'email', label: 'Email', render: (value) => value || <span className="text-neutral-300">—</span> },
        {
            key: 'total_invested',
            label: 'Total Invested (PKR)',
            render: (value) => <span className="font-semibold text-info-600">Rs. {fmt(value)}</span>,
        },
        {
            key: 'total_withdrawn',
            label: 'Total Withdrawn (PKR)',
            render: (value) => `Rs. ${fmt(value)}`,
        },
        {
            key: 'net_stake',
            label: 'Net Stake (PKR)',
            render: (value) => <span className="font-semibold text-purple-600">Rs. {fmt(value)}</span>,
        },
        {
            key: 'growth_rate',
            label: 'Growth Rate',
            render: (value) => parseFloat(value) > 0 ? `${(parseFloat(value) * 100).toFixed(2)}% / yr` : <span className="text-neutral-300">—</span>,
        },
        {
            key: 'current_worth',
            label: 'Current Worth (PKR)',
            render: (value) => <span className="font-semibold text-teal-600">Rs. {fmt(value)}</span>,
        },
        {
            key: 'actions',
            label: 'Actions',
            width: '120px',
            render: (_value, row) => (
                <div className="flex gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(row); }}
                        className="text-primary-600 hover:text-primary-700 text-sm"
                    >
                        Edit
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(row); }}
                        className="text-error-600 hover:text-error-700 text-sm"
                    >
                        Delete
                    </button>
                </div>
            ),
        },
    ];

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view investors.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <Link to="/cash-management" className="text-sm text-primary-600 hover:text-primary-700">
                        ← Back to Cash Management
                    </Link>
                    <h1 className="text-3xl font-bold text-neutral-900 mt-1">Investors</h1>
                    <p className="text-neutral-500 mt-1">Manage investors and their capital</p>
                </div>
                <Button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    icon={({ className }) => (
                        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    )}
                >
                    Add Investor
                </Button>
            </div>

            <SearchBar
                onSearch={handleSearch}
                placeholder="Search by name, email, or contact number..."
                value={searchTerm}
            />

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : investors.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">🤝</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Investors Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">Add an investor to start recording their capital.</p>
                </div>
            ) : (
                <>
                    <Table columns={columns} data={investors} onRowClick={handleRowClick} />
                    {meta.totalPages > 1 && (
                        <Pagination currentPage={meta.currentPage} totalPages={meta.totalPages} onPageChange={setPage} />
                    )}
                </>
            )}

            {/* Create/Edit Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => { setShowModal(false); resetForm(); }}
                title={editingInvestor ? 'Edit Investor' : 'Add Investor'}
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter investor name"
                        required
                    />
                    <Input
                        label="Contact Number"
                        value={formData.contact_number}
                        onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                        placeholder="Optional"
                    />
                    <Input
                        label="Email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="Optional"
                    />
                    <Input
                        label="Note"
                        value={formData.note}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        placeholder="Optional"
                    />
                    <Input
                        label="Annual Growth Rate (%)"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.growth_rate}
                        onChange={(e) => setFormData({ ...formData, growth_rate: e.target.value })}
                        placeholder="e.g. 2 for 2% annual — 0 or blank for no growth"
                    />

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
                            {editingInvestor ? 'Update Investor' : 'Create Investor'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete Investor"
                message={`Are you sure you want to delete "${deleteConfirm?.name}"? This is blocked if they have any recorded transactions.`}
            />
        </div>
    );
};

export default InvestorsPage;
