
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { PaperProvider } from 'react-native-paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AccessRevoked from '@/components/AccessRevoked';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import { AppLightTheme, AppDarkTheme } from '../constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  const [lastRedirect, setLastRedirect] = useState<string | null>(null);
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);

  const theme = AppLightTheme;
  const isRevoked = !!user?.kill;

  useEffect(() => {
    AsyncStorage.getItem('intro_seen').then(v => {
      setIntroSeen(v === 'true');
    });
    // Fallback if AsyncStorage hangs
    const t = setTimeout(() => {
      setIntroSeen(prev => prev === null ? true : prev);
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (isRevoked) return;
    if (isLoading || introSeen === null) return;

    let target: string | null = null;
    if (!user) {
      target = !introSeen ? '/(intro)' : '/(auth)/login';
    } else if (user.role === 'admin') {
      target = '/(admin)/dashboard';
    } else if (!user.class || !user.board) {
      target = '/(app)/onboarding';
    } else {
      target = '/(app)/dashboard';
    }

    if (!target) return;
    if (pathname === target) return;
    if (lastRedirect === target) return;

    setLastRedirect(target);
    router.replace(target);
  }, [user, isLoading, introSeen, pathname, router, lastRedirect]);

  return (
    <PaperProvider theme={theme}>
      {isRevoked ? (
        <AccessRevoked />
      ) : (
        <ThemeProvider value={DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
            <Stack.Screen name="(intro)" options={{ headerShown: false }} />
            <Stack.Screen name="(admin)" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="dark" />
        </ThemeProvider>
      )}
    </PaperProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
