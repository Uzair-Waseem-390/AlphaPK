import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useCashFlowStats } from '../../hooks/useCashFlow';
import ReceivablesSection from './ReceivablesSection';
import PayablesSection from './PayablesSection';
import ExpensesSectionStats from './ExpensesSectionStats';
import BreakdownDrawer from './BreakdownDrawer';
import LoadingSpinner from '../ui/LoadingSpinner';
import Badge from '../ui/Badge';

const AdminDashboard = () => {
    const { user } = useAuth();
    const { data: stats, loading: statsLoading, refetch: refetchStats } = useCashFlowStats();

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

            {/* Stats Section */}
            <div className="space-y-8">
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