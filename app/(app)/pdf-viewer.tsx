import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTheme, Text, Appbar } from 'react-native-paper';
import { useAuth } from '@/context/AuthContext';
import { dataService } from '@/lib/supabase';

export default function PDFViewerScreen() {
  const { url, title, materialId } = useLocalSearchParams<{ url: string; title: string; materialId: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  // For Android, we use Google Docs Viewer. For iOS, WebView handles PDF natively.
  const viewerUrl = Platform.OS === 'android' 
    ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`
    : url;

  useEffect(() => {
    if (user && materialId) {
      dataService.updateProgress(user.id, materialId, 'started');
    }
  }, [user, materialId]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ 
        title: title || 'Document',
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTintColor: '#fff',
      }} />
      
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
      
      <WebView
        source={{ uri: viewerUrl }}
        style={{ flex: 1 }}
        onLoadEnd={() => setLoading(false)}
        startInLoadingState={true}
        renderLoading={() => <View />} // Handled by custom loader
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
});
