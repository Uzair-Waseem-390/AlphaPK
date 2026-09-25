// Login screen — mirrors frontend/src/pages/Login.jsx
// Same brand gradient bg, card layout, email/password fields, error alert.

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '@/context/AuthContext';
import { colors, gradients } from '@/constants/colors';
import { Radius, Shadows, Spacing, Typography } from '@/constants/theme';
import Logo from '@/assets/images/logo.svg';

export default function LoginScreen() {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);

    if (result.success) {
      router.replace('/(app)/dashboard' as never);
    } else {
      setError(result.error);
    }
  };

  return (
    // bg-gradient-to-br from-primary-50 to-accent-50
    <LinearGradient
      colors={[colors.primary[50], colors.accent[50]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Card */}
            <View style={styles.card}>

              {/* Logo + heading */}
              <View style={styles.header}>
                {/* Logo */}
                <View style={styles.logoBox}>
                  <Logo width={52} height={52} />
                </View>

                <Text style={styles.title}>Welcome Back</Text>
                <Text style={styles.subtitle}>Sign in to your account</Text>
              </View>

              {/* Email field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputIcon}>✉</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="admin@example.com"
                    placeholderTextColor={colors.neutral[400]}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    editable={!loading}
                  />
                </View>
              </View>

              {/* Password field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputIcon}>🔒</Text>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    placeholderTextColor={colors.neutral[400]}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    editable={!loading}
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={8}
                    style={styles.eyeBtn}
                  >
                    <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
                  </Pressable>
                </View>
              </View>

              {/* Error alert */}
              {!!error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Submit button */}
              <Pressable
                onPress={handleLogin}
                disabled={loading}
                style={({ pressed }) => [styles.btnWrapper, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient
                  colors={gradients.brand as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.btn}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.btnText}>Sign In</Text>
                  )}
                </LinearGradient>
              </Pressable>

              {/* Demo credentials hint */}
              <View style={styles.demoHint}>
                <Text style={styles.demoText}>Demo: admin@example.com / admin123</Text>
              </View>

            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[6],
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: Radius.xl,
    padding: Spacing[8],
    ...Shadows.card,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing[8],
    gap: Spacing[2],
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[2],
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    overflow: 'hidden',
    padding: 6,
  },
  title: {
    fontSize: Typography.size['2xl'],
    fontWeight: '700',
    color: colors.neutral[900],
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Typography.size.base,
    color: colors.neutral[500],
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  fieldGroup: {
    marginBottom: Spacing[4],
    gap: Spacing[2],
  },
  label: {
    fontSize: Typography.size.sm,
    fontWeight: '500',
    color: colors.neutral[700],
    fontFamily: 'Inter_500Medium',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: Radius.lg,
    backgroundColor: colors.neutral[50],
    paddingHorizontal: Spacing[3],
    height: 48,
  },
  inputIcon: {
    fontSize: 16,
    marginRight: Spacing[2],
    opacity: 0.5,
  },
  input: {
    flex: 1,
    fontSize: Typography.size.base,
    color: colors.neutral[900],
    fontFamily: 'Inter_400Regular',
    paddingVertical: 0,
  },
  eyeBtn: {
    paddingLeft: Spacing[2],
  },
  eyeText: {
    fontSize: 16,
  },
  errorBox: {
    backgroundColor: colors.error[50],
    borderLeftWidth: 3,
    borderLeftColor: colors.error[500],
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginBottom: Spacing[4],
  },
  errorText: {
    fontSize: Typography.size.sm,
    color: colors.error[700],
    fontFamily: 'Inter_400Regular',
  },
  btnWrapper: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginTop: Spacing[2],
  },
  btn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
  },
  btnText: {
    fontSize: Typography.size.base,
    fontWeight: '600',
    color: colors.white,
    fontFamily: 'Inter_600SemiBold',
  },
  demoHint: {
    marginTop: Spacing[6],
    alignItems: 'center',
  },
  demoText: {
    fontSize: Typography.size.xs,
    color: colors.neutral[400],
    fontFamily: 'Inter_400Regular',
    fontVariant: ['tabular-nums'],
  },
});
