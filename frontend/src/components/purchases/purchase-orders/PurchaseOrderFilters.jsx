import { useState } from 'react';
import { motion } from 'framer-motion';
import SearchBar from '../../common/SearchBar';
import Select from '../../common/Select';
import DatePicker from '../../common/DatePicker';

const PurchaseOrderFilters = ({ onFilter, onSearch }) => {
    const [filters, setFilters] = useState({
        search: '',
        status: '',
        paymentStatus: '',
        dateFrom: '',
        dateTo: '',
        minAmount: '',
        maxAmount: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleDateChange = (name) => (e) => {
        setFilters(prev => ({ ...prev, [name]: e.target.value }));
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
        { value: 'draft', label: 'Draft' },
        { value: 'confirmed', label: 'Confirmed' },
        { value: 'partial', label: 'Partial' },
        { value: 'returned', label: 'Returned' },
    ];

    const paymentOptions = [
        { value: '', label: 'All Payment' },
        { value: 'unpaid', label: 'Unpaid' },
        { value: 'partial', label: 'Partial' },
        { value: 'paid', label: 'Paid' },
    ];

    return (
        <motion.div
            className="space-y-4 mb-6"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <SearchBar
                onSearch={handleSearch}
                placeholder="Search by bill number or customer..."
                className="flex-1"
            />

            <div className="flex flex-wrap gap-3">
                <Select
                    name="status"
                    value={filters.status}
                    onChange={handleChange}
                    options={statusOptions}
                    placeholder="Status"
                    className="w-40"
                />

                <Select
                    name="paymentStatus"
                    value={filters.paymentStatus}
                    onChange={handleChange}
                    options={paymentOptions}
                    placeholder="Payment Status"
                    className="w-40"
                />

                <DatePicker
                    name="dateFrom"
                    value={filters.dateFrom}
                    onChange={handleDateChange('dateFrom')}
                    placeholder="Date From"
                    className="w-40"
                />

                <DatePicker
                    name="dateTo"
                    value={filters.dateTo}
                    onChange={handleDateChange('dateTo')}
                    placeholder="Date To"
                    className="w-40"
                />

                <input
                    type="number"
                    name="minAmount"
                    value={filters.minAmount}
                    onChange={handleChange}
                    placeholder="Min Amount"
                    className="w-32 px-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                />

                <input
                    type="number"
                    name="maxAmount"
                    value={filters.maxAmount}
                    onChange={handleChange}
                    placeholder="Max Amount"
                    className="w-32 px-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
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

export default PurchaseOrderFilters;