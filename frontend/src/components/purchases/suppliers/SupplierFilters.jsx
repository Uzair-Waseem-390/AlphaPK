import { useState } from 'react';
import { motion } from 'framer-motion';
import SearchBar from '../../common/SearchBar';
import Select from '../../common/Select';

const SupplierFilters = ({ onFilter, onSearch }) => {
    const [filters, setFilters] = useState({
        search: '',
        paymentStatus: '',
        minOutstanding: '',
        maxOutstanding: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleSearch = (value) => {
        setFilters(prev => ({ ...prev, search: value }));
        onSearch(value);
    };

    const handleFilter = () => {
        const { search, ...rest } = filters;
        onFilter(rest);
    };

    const statusOptions = [
        { value: '', label: 'All Status' },
        { value: 'unpaid', label: 'Unpaid' },
        { value: 'partial', label: 'Partial' },
    ];

    return (
        <motion.div
            className="space-y-4 mb-6"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <SearchBar
                onSearch={handleSearch}
                placeholder="Search suppliers by name or code..."
                className="flex-1"
            />

            <div className="flex flex-wrap gap-3">
                <Select
                    name="paymentStatus"
                    value={filters.paymentStatus}
                    onChange={handleChange}
                    options={statusOptions}
                    placeholder="Payment Status"
                    className="w-48"
                />

                <input
                    type="number"
                    name="minOutstanding"
                    value={filters.minOutstanding}
                    onChange={handleChange}
                    placeholder="Min Outstanding"
                    className="w-40 px-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                />

                <input
                    type="number"
                    name="maxOutstanding"
                    value={filters.maxOutstanding}
                    onChange={handleChange}
                    placeholder="Max Outstanding"
                    className="w-40 px-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                />

                <button
                    onClick={handleFilter}
                    className="px-6 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
                >
                    Apply Filters
                </button>
            </div>
        </motion.div>
    );
};

export default SupplierFilters;