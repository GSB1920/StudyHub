import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';

export default function AdminLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: theme.colors.primary },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' },
    }}>
      <Stack.Screen name="dashboard" options={{ title: 'Admin' }} />
      <Stack.Screen name="materials/[id]" options={{ title: 'Manage Materials' }} />
    </Stack>
  );
}
