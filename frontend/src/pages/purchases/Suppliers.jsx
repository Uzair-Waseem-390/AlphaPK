import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { suppliersApi } from '../../utils/api';
import SupplierCard from '../../components/purchases/suppliers/SupplierCard';
import SupplierForm from '../../components/purchases/suppliers/SupplierForm';
import SupplierFilters from '../../components/purchases/suppliers/SupplierFilters';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const Suppliers = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [filteredSuppliers, setFilteredSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [formLoading, setFormLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({});

    useEffect(() => {
        fetchSuppliers();
    }, []);

    useEffect(() => {
        let filtered = [...suppliers];

        if (searchTerm) {
            filtered = filtered.filter(s =>
                s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.code?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        setFilteredSuppliers(filtered);
    }, [suppliers, searchTerm]);

    const fetchSuppliers = async () => {
        setLoading(true);
        try {
            const data = await suppliersApi.getAll();
            setSuppliers(data || []);
            setFilteredSuppliers(data || []);
        } catch (error) {
            console.error('Failed to fetch suppliers:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (data) => {
        setFormLoading(true);
        try {
            await suppliersApi.create(data);
            await fetchSuppliers();
            setShowCreateModal(false);
        } catch (error) {
            console.error('Failed to create supplier:', error);
            alert(error.response?.data?.detail || 'Failed to create supplier');
        } finally {
            setFormLoading(false);
        }
    };

    const handleUpdate = async (data) => {
        setFormLoading(true);
        try {
            await suppliersApi.update(selectedSupplier.id, data);
            await fetchSuppliers();
            setShowEditModal(false);
        } catch (error) {
            console.error('Failed to update supplier:', error);
            alert(error.response?.data?.detail || 'Failed to update supplier');
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this supplier?')) return;
        try {
            await suppliersApi.delete(id);
            await fetchSuppliers();
        } catch (error) {
            console.error('Failed to delete supplier:', error);
            alert(error.response?.data?.detail || 'Failed to delete supplier');
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900">Suppliers</h1>
                    <p className="text-neutral-500 mt-1">Manage your suppliers</p>
                </div>
                <Button onClick={() => setShowCreateModal(true)}>
                    Add Supplier
                </Button>
            </div>

            <SupplierFilters
                onSearch={setSearchTerm}
                onFilter={setFilters}
            />

            <AnimatePresence mode="popLayout">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredSuppliers.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="col-span-full text-center py-12"
                        >
                            <p className="text-neutral-500">No suppliers found</p>
                        </motion.div>
                    ) : (
                        filteredSuppliers.map((supplier) => (
                            <SupplierCard
                                key={supplier.id}
                                supplier={supplier}
                                onEdit={(s) => {
                                    setSelectedSupplier(s);
                                    setShowEditModal(true);
                                }}
                                onDelete={handleDelete}
                            />
                        ))
                    )}
                </div>
            </AnimatePresence>

            {/* Create Supplier Modal */}
            <Modal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Create Supplier"
            >
                <SupplierForm
                    onSubmit={handleCreate}
                    onCancel={() => setShowCreateModal(false)}
                    loading={formLoading}
                />
            </Modal>

            {/* Edit Supplier Modal */}
            <Modal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                title="Edit Supplier"
            >
                <SupplierForm
                    initialData={selectedSupplier}
                    onSubmit={handleUpdate}
                    onCancel={() => setShowEditModal(false)}
                    loading={formLoading}
                />
            </Modal>
        </div>
    );
};

export default Suppliers;