import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { systemApi } from '../../services/systemApi';
import { useCashFlowStats } from '../../hooks/useCashFlow';
import { useTaxesStats } from '../../hooks/useTaxes';
import { useCashManagementStats } from '../../hooks/useCashManagement';
import { useAssetStats } from '../../hooks/useAssets';
import { useRecurringExpenseFlowStats } from '../../hooks/useRecurringExpenses';
import { useProfitFlowStats } from '../../hooks/useProfits';
import ReceivablesSection from './ReceivablesSection';
import PayablesSection from './PayablesSection';
import ExpensesSectionStats from './ExpensesSectionStats';
import LostInventorySectionStats from './LostInventorySectionStats';
import ReturnsSectionStats from './ReturnsSectionStats';
import ProfitSectionStats from './ProfitSectionStats';
import TaxesSectionStats from './TaxesSectionStats';
import CashManagementSectionStats from './CashManagementSectionStats';
import AssetsSectionStats from './AssetsSectionStats';
import RecurringExpensesSectionStats from './RecurringExpensesSectionStats';
import GrossProfitTrendChart from './GrossProfitTrendChart';
import NetProfitTrendChart from './NetProfitTrendChart';
import BreakdownDrawer from './BreakdownDrawer';
import CollapsibleGroup from './CollapsibleGroup';
import KpiStrip from './KpiStrip';
import LoadingSpinner from '../ui/LoadingSpinner';
import Badge from '../ui/Badge';

const AdminDashboard = () => {
    const { user } = useAuth();

    // IMPORTANT — SYSTEM DESIGN, DO NOT REMOVE THIS WHEN REPLACING THE DASHBOARD:
    // This triggers every "catch-up on read" calculation in the backend
    // (asset depreciation, investor growth, monthly profit finalization —
    // see backend/backend/views.py TriggerAllCatchUpsView) once per
    // dashboard load. It exists precisely so those three stay fresh
    // regardless of which specific stat hooks/endpoints the dashboard ends
    // up calling — do not assume the individual stats hooks below cover
    // this on their own; whatever replaces this component must keep this
    // call (or move it somewhere that still fires on every dashboard load).
    useEffect(() => {
        systemApi.triggerAllCatchUps().catch((err) => {
            console.error('Failed to trigger backend catch-up calculations:', err);
        });
    }, []);

    const { data: stats, loading: statsLoading } = useCashFlowStats();
    const { data: taxStats, loading: taxStatsLoading } = useTaxesStats();
    const { data: cashMgmtStats, loading: cashMgmtStatsLoading } = useCashManagementStats();
    const { data: assetStats, loading: assetStatsLoading } = useAssetStats();
    const { data: recurringExpenseStats, loading: recurringExpenseStatsLoading } = useRecurringExpenseFlowStats();
    const { data: profitFlowStats, loading: profitFlowLoading } = useProfitFlowStats();

    // UI State
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerConfig, setDrawerConfig] = useState({ type: '', title: '' });

    const handleCardClick = (type, title) => {
        setDrawerConfig({ type, title });
        setDrawerOpen(true);
    };

    if (statsLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    const kpiItems = [
        {
            label: 'Cash in Hand',
            value: stats?.cash_in_hand,
            icon: '💵',
            color: 'primary',
            onClick: () => handleCardClick('cashInHand', 'Cash in Hand Breakdown'),
        },
        {
            label: 'Net Profit',
            value: profitFlowStats?.total_net_profit,
            icon: '📊',
            color: 'green',
            subtitle: `${profitFlowStats?.months_finalized_count ?? 0} months finalized`,
            onClick: () => handleCardClick('monthlyProfit', 'Monthly Net Profit'),
        },
        {
            label: 'Customer Outstanding',
            value: stats?.customer_outstanding,
            icon: '🧾',
            color: 'amber',
            onClick: () => handleCardClick('customerOutstanding', 'Customer Outstanding Breakdown'),
        },
        {
            label: 'Supplier Outstanding',
            value: stats?.total_outstanding_payable,
            icon: '📦',
            color: 'rose',
            onClick: () => handleCardClick('supplierOutstanding', 'Supplier Outstanding Breakdown'),
        },
    ];

    return (
        <div className="space-y-6">
            {/* Welcome Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-primary-600 to-indigo-600 rounded-2xl p-6 text-white"
            >
                <h1 className="text-2xl font-bold">
                    Welcome back, {user?.first_name} {user?.last_name}!
                </h1>
                <div className="flex items-center gap-2 mt-1">
                    <Badge variant="info" className="bg-white/20 text-white">
                        {user?.role === 'superuser' ? 'Superuser' : 'Admin'}
                    </Badge>
                    <span className="text-white/80 text-sm">Full access</span>
                </div>
            </motion.div>

            {/* KPI Strip — the numbers that matter most, at a glance */}
            <KpiStrip items={kpiItems} loading={statsLoading || profitFlowLoading} />

            {/* Trend charts — always visible, not tucked behind an accordion */}
            <div className="space-y-6">
                <GrossProfitTrendChart />
                <NetProfitTrendChart />
            </div>

            {/* Grouped, collapsible stat sections */}
            <div className="space-y-4">
                <CollapsibleGroup
                    title="Sales & Profit"
                    icon="💰"
                    description="Profit, receivables, and customer returns"
                    defaultOpen
                >
                    <ProfitSectionStats stats={stats} loading={statsLoading} onCardClick={handleCardClick} />
                    <ReceivablesSection stats={stats} loading={statsLoading} onCardClick={handleCardClick} />
                    <ReturnsSectionStats stats={stats} loading={statsLoading} onCardClick={handleCardClick} />
                </CollapsibleGroup>

                <CollapsibleGroup
                    title="Purchasing & Expenses"
                    icon="🛒"
                    description="Payables, expenses, and recurring costs"
                >
                    <PayablesSection stats={stats} loading={statsLoading} onCardClick={handleCardClick} />
                    <ExpensesSectionStats stats={stats} loading={statsLoading} onCardClick={handleCardClick} />
                    <RecurringExpensesSectionStats stats={recurringExpenseStats} loading={recurringExpenseStatsLoading} />
                </CollapsibleGroup>

                <CollapsibleGroup
                    title="Operations & Risk"
                    icon="⚠️"
                    description="Lost inventory and tax position"
                >
                    <LostInventorySectionStats stats={stats} loading={statsLoading} onCardClick={handleCardClick} />
                    <TaxesSectionStats stats={taxStats} loading={taxStatsLoading} />
                </CollapsibleGroup>

                <CollapsibleGroup
                    title="Capital & Assets"
                    icon="🏦"
                    description="Investor capital and fixed assets"
                >
                    <CashManagementSectionStats stats={cashMgmtStats} loading={cashMgmtStatsLoading} />
                    <AssetsSectionStats stats={assetStats} loading={assetStatsLoading} />
                </CollapsibleGroup>
            </div>

            {/* Breakdown Drawer */}
            <BreakdownDrawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                title={drawerConfig.title}
                type={drawerConfig.type}
            />
        </div>
    );
};

export default AdminDashboard;
