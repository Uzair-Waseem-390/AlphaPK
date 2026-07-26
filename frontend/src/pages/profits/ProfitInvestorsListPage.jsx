import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cashManagementApi } from '../../services/cashManagementApi';
import Table from '../../components/ui/Table';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const fmt = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
};

const ProfitInvestorsListPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

    const [investors, setInvestors] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        cashManagementApi.investors.getAll({ page_size: 500 }).then((res) => {
            setInvestors(res?.results ?? res ?? []);
        }).finally(() => setLoading(false));
    }, []);

    if (!isAdmin) {
        return (
            <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-neutral-900">Access Denied</h2>
                <p className="text-neutral-500 mt-2">Only admins or superusers can view investors.</p>
            </div>
        );
    }

    const columns = [
        { key: 'name', label: 'Name' },
        { key: 'contact', label: 'Contact', render: (_v, row) => row.contact_number || row.email || <span className="text-neutral-300">—</span> },
        { key: 'total_invested', label: 'Total Invested (PKR)', render: (v) => `Rs. ${fmt(v)}` },
        { key: 'total_withdrawn', label: 'Total Withdrawn (PKR)', render: (v) => `Rs. ${fmt(v)}` },
        { key: 'net_stake', label: 'Net Stake (PKR)', render: (v) => <span className="font-semibold text-neutral-900">Rs. {fmt(v)}</span> },
        { key: 'current_worth', label: 'Current Worth (PKR)', render: (v) => <span className="font-semibold text-primary-600">Rs. {fmt(v)}</span> },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-neutral-900">Investors</h1>
                <p className="text-neutral-500 mt-1">
                    Click an investor to view their profit history and settle monthly shares.
                </p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="lg" />
                </div>
            ) : investors.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">🤝</div>
                    <h3 className="text-lg font-semibold text-neutral-900">No Investors Yet</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                        Add investors from Cash Management → Investors.
                    </p>
                </div>
            ) : (
                <Table
                    columns={columns}
                    data={investors}
                    onRowClick={(row) => navigate(`/profits/investors/${row.id}`)}
                />
            )}
        </div>
    );
};

export default ProfitInvestorsListPage;
