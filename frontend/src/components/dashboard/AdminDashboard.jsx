import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
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
import { DollarSign, ShoppingCart, AlertTriangle, Landmark, Banknote, BarChart3, Receipt, Package, TrendingUp, Calendar } from 'lucide-react';
import GrossProfitTrendChart from './GrossProfitTrendChart';
import NetProfitTrendChart from './NetProfitTrendChart';
import BreakdownDrawer from './BreakdownDrawer';
import CollapsibleGroup from './CollapsibleGroup';
import KpiStrip from './KpiStrip';
import Badge from '../ui/Badge';
import InlineAlert from '../ui/InlineAlert';

// Tab definitions — order and keys are stable (used for active-tab state)
const TABS = [
    {
        key: 'sales',
        label: 'Sales & Profit',
        icon: DollarSign,
        description: 'Profit, receivables, and customer returns',
    },
    {
        key: 'purchasing',
        label: 'Purchasing & Expenses',
        icon: ShoppingCart,
        description: 'Payables, expenses, and recurring costs',
    },
    {
        key: 'operations',
        label: 'Operations & Risk',
        icon: AlertTriangle,
        description: 'Lost inventory and tax position',
    },
    {
        key: 'capital',
        label: 'Capital & Assets',
        icon: Landmark,
        description: 'Investor capital and fixed assets',
    },
];

const AdminDashboard = () => {
    const { user } = useAuth();
    const { toast } = useToast();

    // IMPORTANT — SYSTEM DESIGN, DO NOT REMOVE:
    // Triggers every "catch-up on read" calculation in the backend
    // (asset depreciation, investor growth, monthly profit finalization —
    // see backend/backend/views.py TriggerAllCatchUpsView) once per
    // dashboard load. Whatever replaces this component must keep this call
    // or move it somewhere that still fires on every dashboard load.
    useEffect(() => {
        systemApi.triggerAllCatchUps().catch((err) => {
            console.error('Failed to trigger backend catch-up calculations:', err);
            toast.error('Some background calculations failed to refresh — figures may be slightly stale.');
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const { data: stats, loading: statsLoading, error: statsError } = useCashFlowStats();
    const { data: taxStats, loading: taxStatsLoading, error: taxStatsError } = useTaxesStats();
    const { data: cashMgmtStats, loading: cashMgmtStatsLoading, error: cashMgmtStatsError } = useCashManagementStats();
    const { data: assetStats, loading: assetStatsLoading, error: assetStatsError } = useAssetStats();
    const { data: recurringExpenseStats, loading: recurringExpenseStatsLoading, error: recurringExpenseStatsError } = useRecurringExpenseFlowStats();
    const { data: profitFlowStats, loading: profitFlowLoading, error: profitFlowError } = useProfitFlowStats();

    // Drawer state
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerConfig, setDrawerConfig] = useState({ type: '', title: '' });

    // Desktop tab state
    const [activeTab, setActiveTab] = useState('sales');

    const handleCardClick = (type, title) => {
        setDrawerConfig({ type, title });
        setDrawerOpen(true);
    };

    // Surface hook errors as transient toasts
    useEffect(() => { if (statsError) toast.error(statsError); }, [statsError]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (taxStatsError) toast.error(taxStatsError); }, [taxStatsError]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (cashMgmtStatsError) toast.error(cashMgmtStatsError); }, [cashMgmtStatsError]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (assetStatsError) toast.error(assetStatsError); }, [assetStatsError]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (recurringExpenseStatsError) toast.error(recurringExpenseStatsError); }, [recurringExpenseStatsError]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (profitFlowError) toast.error(profitFlowError); }, [profitFlowError]); // eslint-disable-line react-hooks/exhaustive-deps

    const kpiItems = [
        {
            label: 'Cash in Hand',
            value: stats?.cash_in_hand,
            icon: Banknote,
            color: 'primary',
            onClick: () => handleCardClick('cashInHand', 'Cash in Hand Breakdown'),
        },
        {
            label: 'Net Profit',
            value: profitFlowStats?.total_net_profit,
            icon: BarChart3,
            color: 'green',
            subtitle: `${profitFlowStats?.months_finalized_count ?? 0} months finalized`,
            onClick: () => handleCardClick('monthlyProfit', 'Monthly Net Profit'),
        },
        {
            label: 'Customer Outstanding',
            value: stats?.customer_outstanding,
            icon: Receipt,
            color: 'amber',
            onClick: () => handleCardClick('customerOutstanding', 'Customer Outstanding Breakdown'),
        },
        {
            label: 'Supplier Outstanding',
            value: stats?.total_outstanding_payable,
            icon: Package,
            color: 'rose',
            onClick: () => handleCardClick('supplierOutstanding', 'Supplier Outstanding Breakdown'),
        },
    ];

    // Today's date — display only, safe to use toLocaleDateString here
    const today = new Date().toLocaleDateString('en-PK', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    return (
        <div className="space-y-6">

            {/* ── Welcome hero ── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-primary-800 to-accent-700 p-7 text-white shadow-premium"
            >
                {/* Decorative background circles */}
                <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full bg-white/[0.04] pointer-events-none" />
                <div className="absolute -bottom-16 -right-4 w-72 h-72 rounded-full bg-accent-500/[0.08] pointer-events-none" />
                <div className="absolute top-4 right-32 w-20 h-20 rounded-full bg-white/[0.03] pointer-events-none" />

                <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Badge variant="info" className="bg-white/15 text-white border-0 text-[11px] font-semibold tracking-wide px-2.5 py-1">
                                {user?.role === 'superuser' ? 'Superuser' : 'Admin'}
                            </Badge>
                            <span className="text-white/50 text-xs">·</span>
                            <span className="text-white/60 text-xs font-medium">Full access</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight">
                            Welcome back, {user?.first_name}!
                        </h1>
                        <p className="text-white/60 text-sm mt-1.5 font-medium">
                            {profitFlowStats?.months_finalized_count
                                ? `${profitFlowStats.months_finalized_count} months of finalized profit data`
                                : 'Your business overview is ready'}
                        </p>
                    </div>

                    {/* Date chip */}
                    <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 flex-shrink-0 self-start sm:self-auto">
                        <Calendar className="w-4 h-4 text-white/70 flex-shrink-0" />
                        <div>
                            <p className="text-[11px] text-white/50 font-medium uppercase tracking-wider leading-none mb-1">Today</p>
                            <p className="text-sm text-white font-semibold leading-none">{today}</p>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* ── KPI Strip ── */}
            <KpiStrip items={kpiItems} loading={statsLoading || profitFlowLoading} />

            {/* ── Performance Trends — two-column chart grid ── */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-4 h-4 text-neutral-400" />
                    <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">Performance Trends</h2>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <GrossProfitTrendChart />
                    <NetProfitTrendChart />
                </div>
            </div>

            {/* ── Stat sections ── */}
            <div>
                {/* Desktop tab bar — hidden on mobile */}
                <div className="hidden lg:flex items-center gap-1 bg-white rounded-2xl shadow-card ring-1 ring-neutral-100 p-1.5 mb-5">
                    {TABS.map((tab) => {
                        const TabIcon = tab.icon;
                        const active = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer
                                    ${active
                                        ? 'bg-primary-700 text-white shadow-sm'
                                        : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
                                    }`}
                            >
                                <TabIcon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-white' : 'text-neutral-400'}`} />
                                <span className="whitespace-nowrap">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Sales & Profit */}
                <CollapsibleGroup
                    title="Sales & Profit"
                    icon={DollarSign}
                    description="Profit, receivables, and customer returns"
                    defaultOpen
                    isActive={activeTab === 'sales'}
                    onTabClick={() => setActiveTab('sales')}
                >
                    {statsError && <InlineAlert variant="error" message={statsError} />}
                    <ProfitSectionStats stats={stats} loading={statsLoading} onCardClick={handleCardClick} />
                    <ReceivablesSection stats={stats} loading={statsLoading} onCardClick={handleCardClick} />
                    <ReturnsSectionStats stats={stats} loading={statsLoading} onCardClick={handleCardClick} />
                </CollapsibleGroup>

                {/* Purchasing & Expenses */}
                <CollapsibleGroup
                    title="Purchasing & Expenses"
                    icon={ShoppingCart}
                    description="Payables, expenses, and recurring costs"
                    isActive={activeTab === 'purchasing'}
                    onTabClick={() => setActiveTab('purchasing')}
                >
                    {statsError && <InlineAlert variant="error" message={statsError} />}
                    {recurringExpenseStatsError && <InlineAlert variant="error" message={recurringExpenseStatsError} />}
                    <PayablesSection stats={stats} loading={statsLoading} onCardClick={handleCardClick} />
                    <ExpensesSectionStats stats={stats} loading={statsLoading} onCardClick={handleCardClick} />
                    <RecurringExpensesSectionStats stats={recurringExpenseStats} loading={recurringExpenseStatsLoading} />
                </CollapsibleGroup>

                {/* Operations & Risk */}
                <CollapsibleGroup
                    title="Operations & Risk"
                    icon={AlertTriangle}
                    description="Lost inventory and tax position"
                    isActive={activeTab === 'operations'}
                    onTabClick={() => setActiveTab('operations')}
                >
                    {statsError && <InlineAlert variant="error" message={statsError} />}
                    {taxStatsError && <InlineAlert variant="error" message={taxStatsError} />}
                    <LostInventorySectionStats stats={stats} loading={statsLoading} onCardClick={handleCardClick} />
                    <TaxesSectionStats stats={taxStats} loading={taxStatsLoading} />
                </CollapsibleGroup>

                {/* Capital & Assets */}
                <CollapsibleGroup
                    title="Capital & Assets"
                    icon={Landmark}
                    description="Investor capital and fixed assets"
                    isActive={activeTab === 'capital'}
                    onTabClick={() => setActiveTab('capital')}
                >
                    {cashMgmtStatsError && <InlineAlert variant="error" message={cashMgmtStatsError} />}
                    {assetStatsError && <InlineAlert variant="error" message={assetStatsError} />}
                    <CashManagementSectionStats stats={cashMgmtStats} loading={cashMgmtStatsLoading} />
                    <AssetsSectionStats stats={assetStats} loading={assetStatsLoading} />
                </CollapsibleGroup>
            </div>

            {/* Breakdown Drawer — unchanged */}
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
