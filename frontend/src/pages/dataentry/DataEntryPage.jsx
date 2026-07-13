import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Tabs from '../../components/ui/Tabs';
import SupplierOpeningBalancePanel from '../../components/dataentry/SupplierOpeningBalancePanel';
import CustomerOpeningBalancePanel from '../../components/dataentry/CustomerOpeningBalancePanel';
import OpeningCashPanel from '../../components/dataentry/OpeningCashPanel';
import OpeningStockPanel from '../../components/dataentry/OpeningStockPanel';

const TABS = [
    { value: 'supplier', label: 'Supplier Opening Balance' },
    { value: 'customer', label: 'Customer Opening Balance' },
    { value: 'cash', label: 'Opening Cash' },
    { value: 'stock', label: 'Opening Stock' },
];

const DataEntryPage = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('supplier');

    // Superuser-only page. Non-superusers are redirected (backend also enforces).
    if (user?.role !== 'superuser') {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-neutral-900">Data Entry</h1>
                <p className="text-neutral-500 mt-1">
                    One-time bootstrap of opening balances, cash and stock before go-live.
                    Opening balances are <span className="font-medium">permanently locked</span> after creation.
                </p>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-sm text-amber-700">
                    ⚠️ Superuser tool. Entries here cannot be edited or deleted. Opening balances
                    appear only as outstanding amounts to be settled — they don’t count as
                    operating-period purchases or sales.
                </p>
            </div>

            <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

            {activeTab === 'supplier' && <SupplierOpeningBalancePanel />}
            {activeTab === 'customer' && <CustomerOpeningBalancePanel />}
            {activeTab === 'cash' && <OpeningCashPanel />}
            {activeTab === 'stock' && <OpeningStockPanel />}
        </div>
    );
};

export default DataEntryPage;
