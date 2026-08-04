import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bgElevated,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
    notification: colors.accent,
  },
};

function BootSplash() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AuthProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style="light" />
        <RootNavigator />
      </ThemeProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { ready, apiKey } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const inLogin = segments[0] === 'login';

  useEffect(() => {
    if (!ready) return;

    if (!apiKey && !inLogin) {
      router.replace('/login');
    } else if (apiKey && inLogin) {
      // Prefer `/` over `/(tabs)` — more reliable on web / PWA
      router.replace('/');
    }
  }, [ready, apiKey, inLogin, router]);

  // Hold the tree until auth is resolved — and while redirecting — so protected
  // screens never mount without a client (avoids "Not authenticated" crashes).
  if (!ready) {
    return <BootSplash />;
  }

  if (!apiKey && !inLogin) {
    return <BootSplash />;
  }

  if (apiKey && inLogin) {
    return <BootSplash />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="project/[id]"
        options={{ title: 'Project', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="workspace/create"
        options={{ title: 'New workspace', presentation: 'modal' }}
      />
      <Stack.Screen
        name="workspace/[id]"
        options={{ title: 'Workspace', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="workspace/changes"
        options={{ title: 'Changes', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="session/create"
        options={{ title: 'New session', presentation: 'modal' }}
      />
      <Stack.Screen
        name="session/[id]"
        options={{ title: 'Chat', headerBackTitle: 'Back' }}
      />
    </Stack>
  );
}
