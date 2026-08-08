import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useBillingCRUD } from '../../hooks/useBilling';
import { billingApi } from '../../services/billingApi';
import CustomerTable from '../../components/billing/CustomerTable';
import CustomerForm from '../../components/billing/CustomerForm';
import SearchBar from '../../components/ui/SearchBar';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';
import { useNavigate } from 'react-router-dom';

const TIER_TABS = [
    { value: '', label: 'All' },
    { value: 'good', label: 'Good (70+)' },
    { value: 'average', label: 'Average (31-69)' },
    { value: 'poor', label: 'Poor (≤30)' },
];

const CustomersPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
    const navigate = useNavigate();

    const { data, meta, page, setPage, loading, filters, setFilters, resetFilters, create, update, delete: deleteCustomer } = useBillingCRUD(
        billingApi.customers
    );

    const [nameSearch, setNameSearch] = useState('');
    const [codeSearch, setCodeSearch] = useState('');
    const [tierFilter, setTierFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [formLoading, setFormLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const handleSearchName = (value) => {
        setNameSearch(value);
        setFilters({ name: value, code: codeSearch, tier: tierFilter || undefined });
    };

    const handleSearchCode = (value) => {
        setCodeSearch(value);
        setFilters({ name: nameSearch, code: value, tier: tierFilter || undefined });
    };

    const handleTierChange = (tier) => {
        setTierFilter(tier);
        setFilters({ name: nameSearch, code: codeSearch, tier: tier || undefined });
    };

    const handleResetFilters = () => {
        setNameSearch('');
        setCodeSearch('');
        setTierFilter('');
        resetFilters();
    };

    const handleSubmit = async (formData) => {
        setFormLoading(true);
        try {
            if (editingCustomer) {
                await update(editingCustomer.id, formData);
            } else {
                await create(formData);
            }
            setShowModal(false);
            setEditingCustomer(null);
        } catch (error) {
            console.error('Failed to save customer:', error);
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = (customer) => {
        setEditingCustomer(customer);
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        await deleteCustomer(id);
        setDeleteConfirm(null);
    };

    const handleRowClick = (customer) => {
        navigate(`/billing/customers/${customer.id}`);
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">Customers</h1>
                    <p className="text-neutral-500 mt-1">Manage customers and view their outstanding</p>
                </div>
                {isAdmin && (
                    <Button
                        onClick={() => {
                            setEditingCustomer(null);
                            setShowModal(true);
                        }}
                        icon={({ className }) => (
                            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        )}
                    >
                        Add Customer
                    </Button>
                )}
            </div>

            <div className="flex gap-4">
                <SearchBar
                    onSearch={handleSearchName}
                    placeholder="Search by name..."
                    className="flex-1"
                    value={nameSearch}
                />
                <SearchBar
                    onSearch={handleSearchCode}
                    placeholder="Search by code..."
                    className="flex-1"
                    value={codeSearch}
                />
                {(nameSearch || codeSearch || tierFilter) && (
                    <button
                        onClick={handleResetFilters}
                        className="px-4 py-2.5 bg-neutral-100 text-neutral-700 rounded-xl hover:bg-neutral-200 transition-colors"
                    >
                        Clear
                    </button>
                )}
            </div>

            <div className="flex gap-2 flex-wrap">
                {TIER_TABS.map((tab) => (
                    <Button
                        key={tab.value || 'all'}
                        size="sm"
                        variant={tierFilter === tab.value ? 'primary' : 'secondary'}
                        onClick={() => handleTierChange(tab.value)}
                    >
                        {tab.label}
                    </Button>
                ))}
            </div>

            <CustomerTable
                customers={data}
                onRowClick={handleRowClick}
                onEdit={handleEdit}
                onDelete={(id) => setDeleteConfirm(id)}
                isAdmin={isAdmin}
            />

            {meta.totalPages > 1 && (
                <Pagination
                    currentPage={meta.currentPage}
                    totalPages={meta.totalPages}
                    onPageChange={setPage}
                />
            )}

            {/* Create/Edit Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    setEditingCustomer(null);
                }}
                title={editingCustomer ? 'Edit Customer' : 'Create Customer'}
            >
                <CustomerForm
                    initialData={editingCustomer}
                    onSubmit={handleSubmit}
                    onCancel={() => {
                        setShowModal(false);
                        setEditingCustomer(null);
                    }}
                    loading={formLoading}
                />
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm)}
                title="Delete Customer"
                message="Are you sure you want to delete this customer? This action cannot be undone."
            />
        </div>
    );
};

export default CustomersPage;