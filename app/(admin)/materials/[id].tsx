import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, Surface, useTheme, Button, TextInput, Chip, List } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { dataService } from '@/lib/appwrite';
import * as DocumentPicker from 'expo-document-picker';

type MaterialType = 'pdf' | 'test' | 'sheet';

export default function AdminMaterials() {
  const theme = useTheme();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MaterialType>('pdf');
  const [url, setUrl] = useState('');

  const loadMaterials = async () => {
    setLoading(true);
    try {
      const { data } = await dataService.adminGetMaterials(String(id));
      setMaterials(data as any[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaterials();
  }, [id]);

  const addMaterial = async () => {
    if (!title) return;
    setLoading(true);
    try {
      const { data } = await dataService.adminAddMaterial(String(id), title, type, url);
      setTitle('');
      setUrl('');
      setMaterials(prev => [...prev, data as any]);
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async () => {
    setLoading(true);
    try {
      const result: any = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      const asset = result?.assets?.[0] ?? (result.type === 'success' ? result : null);
      if (!asset) return;
      const mime = asset.mimeType || 'application/octet-stream';
      const impliedType: MaterialType = mime.includes('pdf') ? 'pdf' : (type || 'sheet');
      const { url, error } = await dataService.uploadMaterialFile(String(id), asset.uri, asset.name || 'file', mime);
      if (error) {
        alert(error.message);
        return;
      }
      const { data } = await dataService.adminAddMaterial(String(id), asset.name || 'File', impliedType, url || '');
      setMaterials(prev => [...prev, data as any]);
      alert('Uploaded and added');
    } catch (e: any) {
      alert(e?.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Surface style={styles.section} elevation={2}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Add Material {name ? `for ${name}` : ''}</Text>
        <TextInput label="Title" value={title} onChangeText={setTitle} mode="outlined" style={styles.input} />
        <TextInput label="URL (optional)" value={url} onChangeText={setUrl} mode="outlined" style={styles.input} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Chip selected={type === 'pdf'} onPress={() => setType('pdf')} icon="file-pdf-box">PDF</Chip>
          <Chip selected={type === 'test'} onPress={() => setType('test')} icon="clipboard-text">Test</Chip>
          <Chip selected={type === 'sheet'} onPress={() => setType('sheet')} icon="file-document">Cheat Sheet</Chip>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button mode="contained" onPress={addMaterial} loading={loading} style={{ flex: 1 }}>Add Material</Button>
          <Button mode="outlined" onPress={uploadFile} loading={loading} style={{ flex: 1 }}>Upload File</Button>
        </View>
      </Surface>

      <Text variant="titleLarge" style={{ marginHorizontal: 20, marginBottom: 8 }}>Materials</Text>
      <FlatList
        data={materials}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <List.Item
            title={item.title}
            description={item.type.toUpperCase()}
            left={props => <List.Icon {...props} icon={item.type === 'pdf' ? 'file-pdf-box' : item.type === 'test' ? 'clipboard-text' : 'file-document'} />}
          />
        )}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant }}>No materials yet</Text>}
        refreshing={loading}
        onRefresh={loadMaterials}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: {
    margin: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  sectionTitle: { marginBottom: 12, fontWeight: 'bold' },
  input: { marginBottom: 12, backgroundColor: 'white' },
});
