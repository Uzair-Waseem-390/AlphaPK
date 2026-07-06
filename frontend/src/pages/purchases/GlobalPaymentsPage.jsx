import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { purchasesApi } from '../../services/purchasesApi';
import Table from '../../components/ui/Table';
import SearchBar from '../../components/ui/SearchBar';
import Select from '../../components/ui/Select';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';

const GlobalPaymentsPage = () => {
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({});

    useEffect(() => {
        fetchPayments();
    }, [filters]);

    const fetchPayments = async () => {
        setLoading(true);
        try {
            const data = await purchasesApi.payments.getAll(filters);
            setPayments(data);
        } catch (error) {
            console.error('Failed to fetch payments:', error);
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        { key: 'reference_number', label: 'Reference', width: '140px' },
        {
            key: 'invoice__bill_number',
            label: 'Order #',
            render: (value) => value || 'N/A'
        },
        {
            key: 'invoice__supplier_name',
            label: 'Supplier',
            render: (value) => value || 'N/A'
        },
        {
            key: 'amount',
            label: 'Amount',
            render: (value) => `$${parseFloat(value || 0).toFixed(2)}`
        },
        {
            key: 'method',
            label: 'Method',
            render: (value) => <Badge>{value}</Badge>
        },
        { key: 'payment_date', label: 'Date', render: (value) => new Date(value).toLocaleDateString() },
        { key: 'note', label: 'Note' },
    ];

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
                <h1 className="text-3xl font-bold text-neutral-900">All Payments</h1>
                <p className="text-neutral-500 mt-1">Search and manage all payments across orders</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
                <SearchBar
                    onSearch={(value) => setFilters({ ...filters, reference: value })}
                    placeholder="Search by reference..."
                    className="flex-1 min-w-[200px]"
                />

                <SearchBar
                    onSearch={(value) => setFilters({ ...filters, supplier_name: value })}
                    placeholder="Search by supplier name..."
                    className="flex-1 min-w-[200px]"
                />

                <SearchBar
                    onSearch={(value) => setFilters({ ...filters, supplier_code: value })}
                    placeholder="Search by supplier code..."
                    className="flex-1 min-w-[200px]"
                />

                <Select
                    value={filters.method || ''}
                    onChange={(e) => setFilters({ ...filters, method: e.target.value })}
                    options={[
                        { value: '', label: 'All Methods' },
                        { value: 'cash', label: 'Cash' },
                        { value: 'jazzcash', label: 'JazzCash' },
                        { value: 'easypaisa', label: 'Easypaisa' },
                        { value: 'bank', label: 'Bank Transfer' },
                    ]}
                    className="w-48"
                />

                <input
                    type="date"
                    value={filters.date_from || ''}
                    onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                    className="px-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                />

                <input
                    type="date"
                    value={filters.date_to || ''}
                    onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                    className="px-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                />

                <button
                    onClick={() => {
                        setFilters({});
                        fetchPayments();
                    }}
                    className="px-4 py-2.5 bg-neutral-100 text-neutral-700 rounded-xl hover:bg-neutral-200 transition-colors"
                >
                    Reset
                </button>
            </div>

            <Table columns={columns} data={payments} />
        </div>
    );
};

export default GlobalPaymentsPage;