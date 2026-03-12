import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Text, Surface, useTheme, Button, Chip, TextInput, Avatar } from 'react-native-paper';
import { dataService } from '@/lib/appwrite';
import { useRouter } from 'expo-router';

const CLASSES = ['8th', '9th', '10th', '11th', '12th'];
const BOARDS = ['CBSE', 'ICSE', 'State Board'];

interface Subject {
  id: string;
  name: string;
  icon: string;
}

export default function AdminDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const [klass, setKlass] = useState<string>('10th');
  const [board, setBoard] = useState<string>('CBSE');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('book-open-variant');

  const loadSubjects = async () => {
    setLoading(true);
    try {
      const { data } = await dataService.adminGetSubjects(klass, board);
      setSubjects(data as Subject[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubjects();
  }, [klass, board]);

  const addSubject = async () => {
    if (!newName) return;
    setLoading(true);
    try {
      const { data } = await dataService.adminAddSubject(klass, board, newName, newIcon);
      setNewName('');
      setSubjects(prev => [...prev, data as Subject]);
    } finally {
      setLoading(false);
    }
  };

  const renderSubject = ({ item }: { item: Subject }) => (
    <TouchableOpacity
      style={styles.subjectItem}
      onPress={() => router.push({ pathname: '/materials/[id]', params: { id: item.id, name: item.name } })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Avatar.Icon size={40} icon={item.icon || 'book-open-variant'} style={{ backgroundColor: theme.colors.secondaryContainer }} />
        <Text variant="titleMedium" style={{ marginLeft: 12 }}>{item.name}</Text>
      </View>
      <Text style={{ color: theme.colors.primary }}>Manage</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Surface style={styles.section} elevation={2}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Select Class</Text>
        <View style={styles.chips}>
          {CLASSES.map(c => (
            <Chip key={c} selected={klass === c} onPress={() => setKlass(c)} showSelectedOverlay style={styles.chip}>{c}</Chip>
          ))}
        </View>
      </Surface>

      <Surface style={styles.section} elevation={2}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Select Board</Text>
        <View style={styles.chips}>
          {BOARDS.map(b => (
            <Chip key={b} selected={board === b} onPress={() => setBoard(b)} showSelectedOverlay style={styles.chip}>{b}</Chip>
          ))}
        </View>
      </Surface>

      <Surface style={styles.section} elevation={2}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Add Subject</Text>
        <TextInput
          label="Subject Name"
          value={newName}
          onChangeText={setNewName}
          mode="outlined"
          style={styles.input}
        />
        <TextInput
          label="Icon (MaterialCommunityIcons)"
          value={newIcon}
          onChangeText={setNewIcon}
          mode="outlined"
          style={styles.input}
        />
        <Button mode="contained" onPress={addSubject} loading={loading}>Add Subject</Button>
      </Surface>

      <Text variant="titleLarge" style={{ marginHorizontal: 20, marginBottom: 8 }}>Subjects</Text>
      <FlatList
        data={subjects}
        keyExtractor={(s) => s.id}
        renderItem={renderSubject}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant }}>No subjects yet</Text>}
        refreshing={loading}
        onRefresh={loadSubjects}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { marginBottom: 6 },
  input: { marginBottom: 12, backgroundColor: 'white' },
  subjectItem: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'white',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
