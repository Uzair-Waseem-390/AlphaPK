import { motion } from 'framer-motion';
import { useState } from 'react';
import Card from '../../common/Card';
import Button from '../../common/Button';
import Modal from '../../common/Modal';
import LoadingSpinner from '../../common/LoadingSpinner';
import { suppliersApi } from '../../../utils/api';

const SupplierCard = ({ supplier, onEdit, onDelete }) => {
    const [showOutstandingModal, setShowOutstandingModal] = useState(false);
    const [outstandingData, setOutstandingData] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleViewOutstanding = async () => {
        setShowOutstandingModal(true);
        setLoading(true);
        try {
            const data = await suppliersApi.getPayableSummary(supplier.id);
            setOutstandingData(data);
        } catch (error) {
            console.error('Failed to fetch outstanding:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <motion.div
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
            >
                <Card className="relative overflow-hidden group">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-lg">
                                    {supplier.name?.[0]?.toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-neutral-900">{supplier.name}</h3>
                                    <p className="text-sm text-neutral-500">Code: {supplier.code}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-3">
                                <div>
                                    <p className="text-xs text-neutral-500">Mobile</p>
                                    <p className="text-sm text-neutral-900">{supplier.mobile || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-neutral-500">Address</p>
                                    <p className="text-sm text-neutral-900 line-clamp-1">{supplier.address}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleViewOutstanding}
                            >
                                Outstanding
                            </Button>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => onEdit(supplier)}
                            >
                                Edit
                            </Button>
                            <Button
                                size="sm"
                                variant="danger"
                                onClick={() => onDelete(supplier.id)}
                            >
                                Delete
                            </Button>
                        </div>
                    </div>
                </Card>
            </motion.div>

            {/* Outstanding Modal */}
            <Modal
                isOpen={showOutstandingModal}
                onClose={() => setShowOutstandingModal(false)}
                title={`Outstanding - ${supplier.name}`}
            >
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <LoadingSpinner size="md" />
                    </div>
                ) : outstandingData ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-neutral-50 p-4 rounded-xl">
                                <p className="text-sm text-neutral-500">Total Billed</p>
                                <p className="text-2xl font-bold text-neutral-900">
                                    ${outstandingData.total_billed || 0}
                                </p>
                            </div>
                            <div className="bg-neutral-50 p-4 rounded-xl">
                                <p className="text-sm text-neutral-500">Total Paid</p>
                                <p className="text-2xl font-bold text-success-600">
                                    ${outstandingData.total_paid || 0}
                                </p>
                            </div>
                            <div className="bg-neutral-50 p-4 rounded-xl">
                                <p className="text-sm text-neutral-500">Outstanding</p>
                                <p className="text-2xl font-bold text-error-600">
                                    ${outstandingData.total_credit_outstanding || 0}
                                </p>
                            </div>
                            <div className="bg-neutral-50 p-4 rounded-xl">
                                <p className="text-sm text-neutral-500">Remaining</p>
                                <p className="text-2xl font-bold text-warning-600">
                                    ${outstandingData.total_remaining || 0}
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button variant="secondary" onClick={() => setShowOutstandingModal(false)}>
                                Close
                            </Button>
                        </div>
                    </div>
                ) : (
                    <p className="text-neutral-500">No data available</p>
                )}
            </Modal>
        </>
    );
};

export default SupplierCard;