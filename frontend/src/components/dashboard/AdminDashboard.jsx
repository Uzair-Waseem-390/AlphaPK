import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useCashFlowStats } from '../../hooks/useCashFlow';
import { useTaxesStats } from '../../hooks/useTaxes';
import { useCashManagementStats } from '../../hooks/useCashManagement';
import { useAssetStats } from '../../hooks/useAssets';
import { useRecurringExpenseFlowStats } from '../../hooks/useRecurringExpenses';
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
import LoadingSpinner from '../ui/LoadingSpinner';
import Badge from '../ui/Badge';

const AdminDashboard = () => {
    const { user } = useAuth();
    const { data: stats, loading: statsLoading, refetch: refetchStats } = useCashFlowStats();
    const { data: taxStats, loading: taxStatsLoading } = useTaxesStats();
    const { data: cashMgmtStats, loading: cashMgmtStatsLoading } = useCashManagementStats();
    const { data: assetStats, loading: assetStatsLoading } = useAssetStats();
    const { data: recurringExpenseStats, loading: recurringExpenseStatsLoading } = useRecurringExpenseFlowStats();

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

            {/* Stats Section — Profit leads, it's the most important number at a glance */}
            <div className="space-y-8">
                <ProfitSectionStats
                    stats={stats}
                    loading={statsLoading}
                    onCardClick={handleCardClick}
                />
                <GrossProfitTrendChart />
                <NetProfitTrendChart />
                <ReceivablesSection
                    stats={stats}
                    loading={statsLoading}
                    onCardClick={handleCardClick}
                />
                <PayablesSection
                    stats={stats}
                    loading={statsLoading}
                    onCardClick={handleCardClick}
                />
                <ExpensesSectionStats
                    stats={stats}
                    loading={statsLoading}
                    onCardClick={handleCardClick}
                />
                <RecurringExpensesSectionStats
                    stats={recurringExpenseStats}
                    loading={recurringExpenseStatsLoading}
                />
                <ReturnsSectionStats
                    stats={stats}
                    loading={statsLoading}
                    onCardClick={handleCardClick}
                />
                <LostInventorySectionStats
                    stats={stats}
                    loading={statsLoading}
                    onCardClick={handleCardClick}
                />
                <TaxesSectionStats
                    stats={taxStats}
                    loading={taxStatsLoading}
                />
                <CashManagementSectionStats
                    stats={cashMgmtStats}
                    loading={cashMgmtStatsLoading}
                />
                <AssetsSectionStats
                    stats={assetStats}
                    loading={assetStatsLoading}
                />
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