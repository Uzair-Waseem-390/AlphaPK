// Root redirect — Expo Router always needs a root index.
// Auth state decides the destination; (app)/_layout.tsx handles the
// actual guard so we just redirect to the protected dashboard here.
import { Redirect } from 'expo-router';

export default function RootIndex() {
  return <Redirect href={'/(app)/dashboard' as never} />;
}
