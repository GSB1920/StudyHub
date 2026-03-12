
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, List, useTheme, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { dataService } from '@/lib/appwrite';
import * as WebBrowser from 'expo-web-browser';

interface Material {
  id: string;
  title: string;
  type: 'pdf' | 'test' | 'sheet';
  url?: string;
  category?: string;
  section?: {
    name: string;
  };
}

export default function SubjectDetailScreen() {
  const { id, name } = useLocalSearchParams();
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const theme = useTheme();

  useEffect(() => {
    loadMaterials();
  }, [id]);

  const loadMaterials = async () => {
    try {
      const { data } = await dataService.getMaterials(id as string);
      setMaterials(data as Material[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (item: Material) => {
    if (item.type === 'test') return 'clipboard-list';
    if (item.type === 'sheet') return 'file-document-outline';
    if (item.url?.toLowerCase().endsWith('.pdf')) return 'file-pdf-box';
    return 'file-outline';
  };

  const openMaterial = (item: Material) => {
    if (item.type === 'pdf' && item.url) {
      router.push({
        pathname: '/(app)/pdf-viewer',
        params: { url: item.url, title: item.title, materialId: item.id }
      });
    } else if (item.url) {
      WebBrowser.openBrowserAsync(item.url);
    }
  };

  const groupedMaterials = React.useMemo(() => {
    const groups: Record<string, Material[]> = {};
    materials.forEach(m => {
      // Priority: Section Name -> Category -> Type Fallback
      let groupName = m.section?.name || m.category;
      
      if (!groupName) {
        if (m.type === 'pdf') groupName = 'Study Materials (PDFs)';
        else if (m.type === 'test') groupName = 'Test Series';
        else if (m.type === 'sheet') groupName = 'Cheat Sheets & Practice';
        else groupName = 'General';
      }
      
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(m);
    });
    return groups;
  }, [materials]);

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text variant="headlineLarge" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
          {name}
        </Text>
        <Text variant="bodyLarge" style={{ color: theme.colors.secondary }}>
          Study Materials & Resources
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" style={{ marginTop: 50 }} />
      ) : (
        <List.Section>
          {Object.entries(groupedMaterials).map(([category, items]) => (
            <List.Accordion
              key={category}
              title={category}
              left={props => <List.Icon {...props} icon="folder-open-outline" />}
            >
              {items.map(item => (
                <List.Item
                  key={item.id}
                  title={item.title}
                  left={props => <List.Icon {...props} icon={getIcon(item)} />}
                  onPress={() => openMaterial(item)}
                />
              ))}
            </List.Accordion>
          ))}
          {materials.length === 0 && (
            <Text style={{ textAlign: 'center', marginTop: 20, color: theme.colors.outline }}>
              No materials available yet.
            </Text>
          )}
        </List.Section>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
  },
  header: {
    marginBottom: 30,
  },
});
