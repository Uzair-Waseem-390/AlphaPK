// Dashboard screen — mirrors frontend AdminDashboard / NormalUserDashboard.
// Calls systemApi.triggerAllCatchUps() on mount (IMPORTANT — see AdminDashboard.jsx note).
// Renders role-appropriate content: KPI cards for admin, inventory overview for regular user.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { systemApi, api } from '@/config/api';
import { colors, gradients } from '@/constants/colors';
import { Radius, Shadows, Spacing, Typography } from '@/constants/theme';
import { formatCurrency } from '@/utils/helpers';
import { extractErrorMessage } from '@/utils/errorMessage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type CashFlowStats = {
  cash_in_hand?: number;
  customer_outstanding?: number;
  total_outstanding_payable?: number;
};

type ProfitStats = {
  total_net_profit?: number;
  months_finalized_count?: number;
};

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------
function KpiCard({
  label,
  value,
  subtitle,
  colorKey,
}: {
  label: string;
  value: number | null | undefined;
  subtitle?: string;
  colorKey: 'primary' | 'success' | 'warning' | 'error';
}) {
  const borderColor = {
    primary: colors.accent[500],
    success: colors.success[500],
    warning: colors.warning[500],
    error: colors.error[500],
  }[colorKey];

  return (
    <View style={[styles.kpiCard, { borderLeftColor: borderColor }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>
        {value != null ? formatCurrency(value) : '—'}
      </Text>
      {subtitle && <Text style={styles.kpiSubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Admin Dashboard
// ---------------------------------------------------------------------------
function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [cashStats, setCashStats] = useState<CashFlowStats | null>(null);
  const [profitStats, setProfitStats] = useState<ProfitStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // IMPORTANT: Trigger backend catch-up calculations on every dashboard load.
      // This keeps asset depreciation, investor growth, and monthly profit fresh.
      // Must not be removed — see frontend AdminDashboard.jsx for the full note.
      systemApi.triggerAllCatchUps().catch((err) => {
        console.error('Catch-up failed:', err);
        toast.error('Some background calculations failed to refresh — figures may be slightly stale.');
      });

      const [cash, profit] = await Promise.allSettled([
        api.get<CashFlowStats>('/cash-flow/stats/'),
        api.get<ProfitStats>('/profits/flow-stats/'),
      ]);

      if (cash.status === 'fulfilled') setCashStats(cash.value as CashFlowStats);
      else toast.error(extractErrorMessage(cash.reason));

      if (profit.status === 'fulfilled') setProfitStats(profit.value as ProfitStats);
      else toast.error(extractErrorMessage(profit.reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + Spacing[8] }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchAll(true); }}
          tintColor={colors.primary[600]}
        />
      }
    >
      {/* Welcome header */}
      <LinearGradient
        colors={gradients.brand as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.welcomeCard}
      >
        <Text style={styles.welcomeTitle}>
          Welcome back, {user?.first_name}!
        </Text>
        <Text style={styles.welcomeSubtitle}>
          Here's your business overview
        </Text>
      </LinearGradient>

      {/* KPI strip */}
      <Text style={styles.sectionTitle}>Key Metrics</Text>
      <View style={styles.kpiGrid}>
        <KpiCard
          label="Cash in Hand"
          value={cashStats?.cash_in_hand}
          colorKey="primary"
        />
        <KpiCard
          label="Net Profit"
          value={profitStats?.total_net_profit}
          subtitle={`${profitStats?.months_finalized_count ?? 0} months finalized`}
          colorKey="success"
        />
        <KpiCard
          label="Customer Outstanding"
          value={cashStats?.customer_outstanding}
          colorKey="warning"
        />
        <KpiCard
          label="Supplier Outstanding"
          value={cashStats?.total_outstanding_payable}
          colorKey="error"
        />
      </View>

      {/* More sections will be built out in Phase 3 */}
      <View style={styles.comingSoon}>
        <Text style={styles.comingSoonText}>
          📊  Charts, receivables, payables and more coming in Phase 3
        </Text>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Normal User Dashboard (inventory + rates overview)
// ---------------------------------------------------------------------------
function NormalUserDashboard() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + Spacing[8] }]}
    >
      <LinearGradient
        colors={gradients.brand as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.welcomeCard}
      >
        <Text style={styles.welcomeTitle}>
          Welcome, {user?.first_name}!
        </Text>
        <Text style={styles.welcomeSubtitle}>
          Use the menu to browse inventory and rates
        </Text>
      </LinearGradient>

      <View style={styles.comingSoon}>
        <Text style={styles.comingSoonText}>
          📦  Inventory and rates overview coming in Phase 3
        </Text>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Main export — branches on role
// ---------------------------------------------------------------------------
export default function DashboardScreen() {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminDashboard /> : <NormalUserDashboard />;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[50],
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.neutral[50],
  },
  container: {
    padding: Spacing[4],
    gap: Spacing[4],
  },
  welcomeCard: {
    borderRadius: Radius.xl,
    padding: Spacing[6],
    gap: Spacing[1],
  },
  welcomeTitle: {
    fontSize: Typography.size.xl,
    fontFamily: 'Inter_700Bold',
    color: colors.white,
  },
  welcomeSubtitle: {
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.8)',
  },
  sectionTitle: {
    fontSize: Typography.size.md,
    fontFamily: 'Inter_600SemiBold',
    color: colors.neutral[900],
    marginBottom: -Spacing[2],
  },
  kpiGrid: {
    gap: Spacing[3],
  },
  kpiCard: {
    backgroundColor: colors.white,
    borderRadius: Radius.xl,
    padding: Spacing[4],
    borderLeftWidth: 4,
    gap: Spacing[1],
    ...Shadows.card,
  },
  kpiLabel: {
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_500Medium',
    color: colors.neutral[500],
  },
  kpiValue: {
    fontSize: Typography.size.xl,
    fontFamily: 'Inter_700Bold',
    color: colors.neutral[900],
  },
  kpiSubtitle: {
    fontSize: Typography.size.xs,
    fontFamily: 'Inter_400Regular',
    color: colors.neutral[400],
  },
  comingSoon: {
    backgroundColor: colors.neutral[100],
    borderRadius: Radius.xl,
    padding: Spacing[6],
    alignItems: 'center',
  },
  comingSoonText: {
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_400Regular',
    color: colors.neutral[500],
    textAlign: 'center',
    lineHeight: 22,
  },
});
