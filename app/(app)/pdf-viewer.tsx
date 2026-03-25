
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Dimensions, Alert } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTheme, Text, TextInput, IconButton, Surface, Button } from 'react-native-paper';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useAuth } from '@/context/AuthContext';
import { dataService } from '@/lib/appwrite';

export default function PDFViewerScreen() {
  const { url, title, materialId } = useLocalSearchParams<{ url: string; title: string; materialId: string }>();
  const theme = useTheme();
  const { user } = useAuth();
  const isExpoGo = Constants.appOwnership === 'expo';
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [inputPage, setInputPage] = useState('1');
  const pdfRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [PdfComponent, setPdfComponent] = useState<any>(null);

  useEffect(() => {
    let mounted = true;

    if (isExpoGo) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const loadedModule = await import('react-native-pdf');
        if (!mounted) return;
        setPdfComponent(() => loadedModule.default || loadedModule);
      } catch (e: any) {
        if (!mounted) return;
        setPdfLoadError(e?.message || 'Failed to load native PDF module');
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isExpoGo]);

  // Load saved progress
  useEffect(() => {
    if (user && materialId) {
      dataService.getProgress(user.id, materialId).then(({ data }) => {
        if (data && data.progress > 0) {
          setCurrentPage(data.progress);
          setInputPage(String(data.progress));
          // Note: react-native-pdf doesn't strictly support initialPage prop dynamically after mount easily,
          // but we can try to set it if we re-render or use setPage.
          // We will use setPage in onLoadComplete
        }
      });
    }
  }, [user, materialId]);

  const saveProgress = async (page: number) => {
    if (user && materialId) {
      await dataService.updateProgress(user.id, materialId, 'reading', page);
    }
  };

  const handlePageChange = (page: number, total: number) => {
    setCurrentPage(page);
    setTotalPages(total);
    setInputPage(String(page));
    saveProgress(page);
  };

  const goToPage = () => {
    const p = parseInt(inputPage);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      pdfRef.current?.setPage(p);
    } else {
      setInputPage(String(currentPage));
    }
  };

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

      {!url ? (
        <View style={[styles.loader, { zIndex: 0 }]}>
            <Text style={{ color: theme.colors.error }}>Error: No PDF URL provided</Text>
        </View>
      ) : isExpoGo ? (
        <View style={[styles.loader, { zIndex: 0, paddingHorizontal: 24 }]}>
          <Text style={{ textAlign: 'center', color: theme.colors.onSurface, marginBottom: 16 }}>
            PDF viewing needs a development build. Open this file in your browser for now.
          </Text>
          <Button mode="contained" onPress={() => Linking.openURL(url)}>
            Open PDF
          </Button>
        </View>
      ) : pdfLoadError ? (
        <View style={[styles.loader, { zIndex: 0, paddingHorizontal: 24 }]}>
          <Text style={{ textAlign: 'center', color: theme.colors.error, marginBottom: 16 }}>
            Failed to load PDF module: {pdfLoadError}
          </Text>
          <Button mode="outlined" onPress={() => Linking.openURL(url)}>
            Open PDF
          </Button>
        </View>
      ) : PdfComponent ? (
        <PdfComponent
          ref={pdfRef}
          source={{ uri: url, cache: true }}
          onLoadComplete={(numberOfPages: number) => {
            setTotalPages(numberOfPages);
            setLoading(false);
            if (currentPage > 1) {
              pdfRef.current?.setPage(currentPage);
            }
          }}
          onPageChanged={(page: number, numberOfPages: number) => {
            handlePageChange(page, numberOfPages);
          }}
          onError={(error: any) => {
            console.log('PDF Error:', error);
            setLoading(false);
            Alert.alert('Error', `Failed to load PDF: ${error}`);
          }}
          onPressLink={(uri: string) => {
            console.log(`Link pressed: ${uri}`);
          }}
          style={styles.pdf}
          enablePaging={true}
          horizontal={true}
          spacing={0}
          fitPolicy={0}
          scale={1}
          minScale={1}
          maxScale={3}
        />
      ) : (
        <View style={[styles.loader, { zIndex: 0 }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}

      {/* Bottom Controls Overlay */}
      {PdfComponent && !isExpoGo ? (
      <View style={styles.controlsOverlay}>
        <Surface style={styles.controls} elevation={4}>
          <IconButton 
            icon="chevron-left" 
            size={24}
            onPress={() => {
              const prev = currentPage - 1;
              if (prev >= 1) pdfRef.current?.setPage(prev);
            }}
            disabled={currentPage <= 1}
          />
          
          <View style={styles.pageInputContainer}>
            <TextInput
              value={inputPage}
              onChangeText={setInputPage}
              onEndEditing={goToPage}
              keyboardType="numeric"
              style={styles.pageInput}
              dense
              mode="outlined"
              contentStyle={{ textAlign: 'center' }}
            />
            <Text style={{ marginLeft: 8, color: '#333' }}>/ {totalPages}</Text>
          </View>

          <IconButton 
            icon="chevron-right" 
            size={24}
            onPress={() => {
              const next = currentPage + 1;
              if (next <= totalPages) pdfRef.current?.setPage(next);
            }}
            disabled={currentPage >= totalPages}
          />
        </Surface>
      </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pdf: {
    flex: 1,
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    backgroundColor: 'white',
  },
  controlsOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 4,
    borderRadius: 28,
    backgroundColor: 'white',
    width: '80%',
    maxWidth: 400,
  },
  pageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageInput: {
    width: 60,
    height: 40,
    backgroundColor: 'white',
    fontSize: 16,
  },
});
