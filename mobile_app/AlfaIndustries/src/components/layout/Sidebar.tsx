// Sidebar drawer — mirrors frontend/src/components/layout/Sidebar.jsx
// Renders mainNavigation, navGroups (collapsible), standaloneLinks.
// Role filtering is applied here (isAdmin / isSuperuser).

import { useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '@/context/AuthContext';
import { mainNavigation, navGroups, standaloneLinks } from '@/config/navigation';
import { colors, gradients } from '@/constants/colors';
import { Radius, Spacing, Typography, SIDEBAR_WIDTH } from '@/constants/theme';
import Logo from '@/assets/images/logo.svg';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
type Props = {
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// NavItem row
// ---------------------------------------------------------------------------
const NavRow = ({
  name,
  path,
  active,
  indent = false,
  onClose,
}: {
  name: string;
  path: string;
  active: boolean;
  indent?: boolean;
  onClose: () => void;
}) => (
  <Pressable
    onPress={() => { router.push(path as never); onClose(); }}
    style={({ pressed }) => [
      styles.navRow,
      indent && styles.navRowIndent,
      active && styles.navRowActive,
      pressed && !active && styles.navRowPressed,
    ]}
  >
    <Text
      style={[
        styles.navLabel,
        active ? styles.navLabelActive : styles.navLabelInactive,
        indent && styles.navLabelSmall,
      ]}
      numberOfLines={1}
    >
      {name}
    </Text>
  </Pressable>
);

// ---------------------------------------------------------------------------
// Collapsible group
// ---------------------------------------------------------------------------
const NavGroupRow = ({
  group,
  isAdmin,
  isSuperuser,
  onClose,
}: {
  group: (typeof navGroups)[number];
  isAdmin: boolean;
  isSuperuser: boolean;
  onClose: () => void;
}) => {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const visibleItems = group.items.filter(
    (item) =>
      (!item.adminOnly || isAdmin) && (!item.superuserOnly || isSuperuser),
  );
  if (visibleItems.length === 0) return null;

  const anyActive = visibleItems.some((i) => pathname.includes(i.path.replace('/(app)', '')));

  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed, anyActive && !open && styles.navRowActive]}
      >
        <Text
          style={[styles.navLabel, anyActive && !open ? styles.navLabelActive : styles.navLabelInactive]}
          numberOfLines={1}
        >
          {group.label}
        </Text>
        <Text style={[styles.chevron, anyActive && !open ? styles.navLabelActive : styles.navLabelInactive]}>
          {open ? '▴' : '▾'}
        </Text>
      </Pressable>

      {open && (
        <View style={styles.groupChildren}>
          {visibleItems.map((item) => (
            <NavRow
              key={item.path}
              name={item.name}
              path={item.path}
              active={pathname.includes(item.path.replace('/(app)', ''))}
              indent
              onClose={onClose}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
export default function Sidebar({ onClose }: Props) {
  const { user, isAdmin, isSuperuser, logout } = useAuth();
  const pathname = usePathname();

  const visibleMain = mainNavigation.filter(
    (i) => (!i.adminOnly || isAdmin) && (!i.superuserOnly || isSuperuser),
  );
  const visibleGroups = navGroups.filter((g) => !g.adminOnly || isAdmin);
  const visibleStandalone = standaloneLinks.filter(
    (i) => (!i.adminOnly || isAdmin) && (!i.superuserOnly || isSuperuser),
  );

  const initials =
    `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`.toUpperCase() || '?';

  const handleLogout = async () => {
    onClose();
    await logout();
    router.replace('/(auth)/login' as never);
  };

  return (
    <View style={styles.container}>
      {/* Logo / App name */}
      <View style={styles.logoRow}>
        <View style={styles.logoBox}>
          <Logo width={28} height={28} />
        </View>
        <Text style={styles.appName} numberOfLines={1}>ALFA INDUSTRIES</Text>
      </View>

      {/* Scrollable nav */}
      <ScrollView
        style={styles.nav}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Spacing[4] }}
      >
        {/* Main nav */}
        {visibleMain.map((item) => (
          <NavRow
            key={item.path}
            name={item.name}
            path={item.path}
            active={pathname.includes(item.path.replace('/(app)', ''))}
            onClose={onClose}
          />
        ))}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Grouped nav */}
        {visibleGroups.map((group) => (
          <NavGroupRow
            key={group.key}
            group={group}
            isAdmin={isAdmin}
            isSuperuser={isSuperuser}
            onClose={onClose}
          />
        ))}

        {/* Standalone links */}
        {visibleStandalone.length > 0 && <View style={styles.divider} />}
        {visibleStandalone.map((item) => (
          <NavRow
            key={item.path}
            name={item.name}
            path={item.path}
            active={pathname.includes(item.path.replace('/(app)', ''))}
            onClose={onClose}
          />
        ))}
      </ScrollView>

      {/* User block + logout */}
      <View style={styles.userBlock}>
        <LinearGradient
          colors={gradients.brand as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </LinearGradient>
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {user?.first_name} {user?.last_name}
          </Text>
          <Text style={styles.userRole} numberOfLines={1}>
            {user?.role === 'superuser' ? 'Superuser' : user?.role === 'admin' ? 'Admin' : 'User'}
          </Text>
        </View>
        <Pressable onPress={handleLogout} hitSlop={8} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>↩</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.white,
    borderRightWidth: 1,
    borderRightColor: colors.neutral[200],
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: colors.white,
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.size.lg,
  },
  appName: {
    fontSize: Typography.size.md,
    fontFamily: 'Inter_700Bold',
    color: colors.neutral[900],
    flex: 1,
  },
  nav: {
    flex: 1,
    paddingHorizontal: Spacing[3],
    paddingTop: Spacing[3],
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[3],
    paddingVertical: 11,
    borderRadius: Radius.lg,
    marginBottom: 2,
  },
  navRowIndent: {
    paddingLeft: Spacing[6],
  },
  navRowActive: {
    backgroundColor: colors.primary[50],
  },
  navRowPressed: {
    backgroundColor: colors.neutral[100],
  },
  navLabel: {
    flex: 1,
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_500Medium',
  },
  navLabelSmall: {
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_400Regular',
  },
  navLabelActive: {
    color: colors.primary[700],
  },
  navLabelInactive: {
    color: colors.neutral[600],
  },
  chevron: {
    fontSize: 10,
    marginLeft: Spacing[2],
  },
  groupChildren: {
    marginBottom: Spacing[1],
  },
  divider: {
    height: 1,
    backgroundColor: colors.neutral[200],
    marginVertical: Spacing[3],
  },
  userBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    padding: Spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: colors.white,
    fontFamily: 'Inter_700Bold',
    fontSize: Typography.size.sm,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: Typography.size.sm,
    fontFamily: 'Inter_600SemiBold',
    color: colors.neutral[900],
  },
  userRole: {
    fontSize: Typography.size.xs,
    fontFamily: 'Inter_400Regular',
    color: colors.neutral[500],
    textTransform: 'capitalize',
  },
  logoutBtn: {
    padding: Spacing[1],
  },
  logoutText: {
    fontSize: 18,
    color: colors.neutral[400],
  },
});
