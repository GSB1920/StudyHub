
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Surface, Button, Chip, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';

const CLASSES = ['8th', '9th', '10th', '11th', '12th'];
const BOARDS = ['CBSE', 'ICSE', 'State Board'];

export default function OnboardingScreen() {
  const { user, updateProfile } = useAuth();
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const theme = useTheme();
  const router = useRouter();

  React.useEffect(() => {
    if (user?.class && user?.board) {
      router.replace('/(app)/dashboard');
    }
  }, [user]);

  const handleContinue = async () => {
    if (!selectedClass || !selectedBoard) return;
    setLoading(true);
    try {
      await updateProfile({
        class: selectedClass,
        board: selectedBoard,
      });
      router.replace('/(app)/dashboard');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text variant="headlineLarge" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
          Welcome!
        </Text>
        <Text variant="bodyLarge" style={{ textAlign: 'center', marginTop: 10 }}>
          Help us personalize your learning experience.
        </Text>
      </View>

      <Surface style={styles.section} elevation={2}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Select your Class</Text>
        <View style={styles.chipContainer}>
          {CLASSES.map((cls) => (
            <Chip
              key={cls}
              selected={selectedClass === cls}
              onPress={() => setSelectedClass(cls)}
              style={styles.chip}
              showSelectedOverlay
            >
              {cls}
            </Chip>
          ))}
        </View>
      </Surface>

      <Surface style={styles.section} elevation={2}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Select your Board</Text>
        <View style={styles.chipContainer}>
          {BOARDS.map((board) => (
            <Chip
              key={board}
              selected={selectedBoard === board}
              onPress={() => setSelectedBoard(board)}
              style={styles.chip}
              showSelectedOverlay
            >
              {board}
            </Chip>
          ))}
        </View>
      </Surface>

      <Button
        mode="contained"
        onPress={handleContinue}
        disabled={!selectedClass || !selectedBoard || loading}
        loading={loading}
        style={styles.button}
        contentStyle={{ paddingVertical: 8 }}
      >
        Start Learning
      </Button>
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
    alignItems: 'center',
    marginBottom: 40,
  },
  section: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: 'white',
    marginBottom: 20,
  },
  sectionTitle: {
    marginBottom: 15,
    fontWeight: 'bold',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    marginBottom: 5,
  },
  button: {
    marginTop: 20,
    borderRadius: 8,
  },
});
