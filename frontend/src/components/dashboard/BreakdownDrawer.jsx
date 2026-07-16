import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { useBreakdown } from '../../hooks/useCashFlow';
import Table from '../ui/Table';
import SearchBar from '../ui/SearchBar';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Input from '../ui/Input';
import LoadingSpinner from '../ui/LoadingSpinner';
import Pagination from '../ui/Pagination';
import DirectionBadge from './DirectionBadge';

const BreakdownDrawer = ({ isOpen, onClose, title, type, initialFilters = {} }) => {
    const { data, meta, page, setPage, loading, filters, setFilters, refetch } = useBreakdown(type, initialFilters);
    const [localFilters, setLocalFilters] = useState(initialFilters);

    useEffect(() => {
        if (isOpen) {
            refetch();
        }
    }, [isOpen]);

    const handleFilterChange = (key, value) => {
        setLocalFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleApplyFilters = () => {
        setFilters(localFilters);
    };

    const handleResetFilters = () => {
        const resetFilters = {};
        Object.keys(localFilters).forEach(key => {
            resetFilters[key] = '';
        });
        setLocalFilters(resetFilters);
        setFilters(resetFilters);
    };

    const getColumns = () => {
        if (type === 'cashInHand') {
            return [
                { key: 'date', label: 'Date', render: (v) => new Date(v).toLocaleDateString() },
                { key: 'direction', label: 'Direction', render: (v) => <DirectionBadge direction={v} /> },
                { key: 'type', label: 'Type' },
                { key: 'description', label: 'Description' },
                { key: 'reference', label: 'Reference' },
                {
                    key: 'amount',
                    label: 'Amount (PKR)',
                    render: (v) => {
                        const num = typeof v === 'string' ? parseFloat(v) : v;
                        return isNaN(num) ? '0.00' : num.toFixed(2);
                    }
                },
                { key: 'method', label: 'Method', render: (v) => v || 'N/A' },
            ];
        }

        // Default columns for other breakdowns
        const defaultColumns = [
            { key: 'id', label: 'ID' },
            ...Object.keys(data[0] || {}).filter(k => k !== 'id').map(key => ({
                key,
                label: key.replace(/_/g, ' ').toUpperCase(),
                render: (v) => {
                    if (typeof v === 'string' && v.includes('T')) return new Date(v).toLocaleString();
                    if (typeof v === 'string' && !isNaN(parseFloat(v))) return parseFloat(v).toFixed(2);
                    if (typeof v === 'object' && v !== null) return v.name || v.bill_number || v.order_number || 'N/A';
                    return v || 'N/A';
                }
            }))
        ];
        return defaultColumns;
    };

    const getFilterConfig = () => {
        if (type === 'cashInHand') {
            return [
                { name: 'date_from', label: 'Date From', type: 'date' },
                { name: 'date_to', label: 'Date To', type: 'date' },
                {
                    name: 'movement_type',
                    label: 'Movement Type',
                    type: 'select',
                    options: [
                        { value: '', label: 'All' },
                        { value: 'inflow', label: 'Inflow' },
                        { value: 'outflow', label: 'Outflow' },
                    ]
                },
            ];
        }
        return [];
    };

    const columns = getColumns();
    const filterConfig = getFilterConfig();

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-40"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'tween', duration: 0.3 }}
                        className="fixed right-0 top-0 h-full w-full max-w-4xl bg-white shadow-xl z-50 overflow-y-auto"
                    >
                        <div className="sticky top-0 bg-white border-b border-neutral-200 p-4 z-10">
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-bold text-neutral-900">{title}</h2>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
                                >
                                    <svg className="w-6 h-6 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            {meta.count > 0 && (
                                <p className="text-sm text-neutral-500">{meta.count} records found</p>
                            )}
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Filters */}
                            {filterConfig.length > 0 && (
                                <div className="flex flex-wrap gap-4 p-4 bg-neutral-50 rounded-xl">
                                    {filterConfig.map((filter) => {
                                        if (filter.type === 'select') {
                                            return (
                                                <Select
                                                    key={filter.name}
                                                    label={filter.label}
                                                    value={localFilters[filter.name] || ''}
                                                    onChange={(e) => handleFilterChange(filter.name, e.target.value)}
                                                    options={filter.options || []}
                                                    className="w-48"
                                                />
                                            );
                                        }
                                        return (
                                            <Input
                                                key={filter.name}
                                                label={filter.label}
                                                type={filter.type}
                                                value={localFilters[filter.name] || ''}
                                                onChange={(e) => handleFilterChange(filter.name, e.target.value)}
                                                className="w-48"
                                            />
                                        );
                                    })}
                                    <div className="flex items-end gap-2">
                                        <Button size="sm" onClick={handleApplyFilters}>
                                            Apply
                                        </Button>
                                        <Button size="sm" variant="secondary" onClick={handleResetFilters}>
                                            Reset
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Table */}
                            {loading ? (
                                <div className="flex items-center justify-center py-12">
                                    <LoadingSpinner size="lg" />
                                </div>
                            ) : data.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="text-6xl mb-4">📊</div>
                                    <h3 className="text-lg font-semibold text-neutral-900">No Data Found</h3>
                                    <p className="text-sm text-neutral-500 mt-1">Try adjusting your filters</p>
                                </div>
                            ) : (
                                <>
                                    <Table columns={columns} data={data} />
                                    {meta.totalPages > 1 && (
                                        <Pagination
                                            currentPage={meta.currentPage}
                                            totalPages={meta.totalPages}
                                            onPageChange={setPage}
                                        />
                                    )}
                                </>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

BreakdownDrawer.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired,
    type: PropTypes.oneOf([
        'cashInHand', 'invoicesCash', 'customerOutstanding',
        'paidPayables', 'supplierOutstanding', 'invoices',
        'purchases', 'expenses', 'lostInventory'
    ]).isRequired,
    initialFilters: PropTypes.object,
};

export default BreakdownDrawer;