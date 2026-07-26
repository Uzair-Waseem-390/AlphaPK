import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cashManagementApi } from '../../services/cashManagementApi';
import Card from '../../components/ui/Card';
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {investors.map((inv) => (
                        <Card
                            key={inv.id}
                            className="p-5 cursor-pointer hover:shadow-card-hover transition-shadow"
                            onClick={() => navigate(`/profits/investors/${inv.id}`)}
                        >
                            <h3 className="font-semibold text-neutral-900">{inv.name}</h3>
                            <p className="text-xs text-neutral-500 mt-0.5">{inv.contact_number || inv.email || '—'}</p>
                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <div>
                                    <p className="text-xs text-neutral-500">Net Stake</p>
                                    <p className="font-semibold text-neutral-900">Rs. {fmt(inv.net_stake)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-neutral-500">Current Worth</p>
                                    <p className="font-semibold text-primary-600">Rs. {fmt(inv.current_worth)}</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ProfitInvestorsListPage;
