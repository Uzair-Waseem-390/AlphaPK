import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLedgerList } from '../../hooks/useLedger';
import LedgerListTable from '../../components/ledger/LedgerListTable';
import SearchBar from '../../components/ui/SearchBar';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';
import InlineAlert from '../../components/ui/InlineAlert';

const LedgerListPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const { data, meta, page, setPage, loading, error, filters, setFilters, refetch } = useLedgerList();
    const [searchTerm, setSearchTerm] = useState('');

    // Redirect normal users
    if (!isAdmin) {
        navigate('/dashboard');
        return null;
    }

    const handleSearch = (value) => {
        setSearchTerm(value);
        setFilters({ search: value });
    };

    const handleRowClick = (ledger) => {
        navigate(`/ledger/${ledger.id}`);
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
                    <h1 className="text-3xl font-bold text-neutral-900">Supplier Ledgers</h1>
                    <p className="text-neutral-500 mt-1">View all supplier account statements</p>
                </div>
            </div>

            <div className="flex gap-4">
                <SearchBar
                    onSearch={handleSearch}
                    placeholder="Search by supplier name or code..."
                    className="flex-1"
                    value={searchTerm}
                />
                {searchTerm && (
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setSearchTerm('');
                            setFilters({});
                        }}
                    >
                        Clear
                    </Button>
                )}
            </div>

            {error && <InlineAlert variant="error" message={error} onRetry={refetch} />}

            <LedgerListTable
                ledgers={data}
                onRowClick={handleRowClick}
                loading={loading}
            />

            {meta.totalPages > 1 && (
                <Pagination
                    currentPage={meta.currentPage}
                    totalPages={meta.totalPages}
                    onPageChange={setPage}
                />
            )}
        </div>
    );
};

export default LedgerListPage;