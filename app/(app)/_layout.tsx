
import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';

export default function AppLayout() {
  const theme = useTheme();

  return (
    <Stack screenOptions={{
      headerStyle: {
        backgroundColor: theme.colors.primary,
      },
      headerTintColor: '#fff',
      headerTitleStyle: {
        fontWeight: 'bold',
      },
    }}>
      <Stack.Screen name="dashboard" options={{ title: 'Dashboard', headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ title: 'Setup Profile', headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="subject/[id]" options={{ title: 'Subject Details', presentation: 'card' }} />
    </Stack>
  );
}
