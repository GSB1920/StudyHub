import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Surface, Chip, Button, useTheme, Avatar, TextInput } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';

const CLASSES = ['8th', '9th', '10th', '11th', '12th'];
const BOARDS = ['CBSE', 'ICSE', 'State Board'];

export default function ProfileScreen() {
  const { user, updateProfile, updateAccount, signOut } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSelectedClass(user?.class ?? null);
    setSelectedBoard(user?.board ?? null);
    setFullName(user?.full_name ?? '');
    setUsername(user?.username ?? '');
    setEmail(user?.email ?? '');
  }, [user]);

  const displayName = user?.email ? user.email.split('@')[0] : 'Student';

  const handleSaveAll = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Update Profile (Class/Board)
      if (selectedClass && selectedBoard) {
        await updateProfile({ class: selectedClass, board: selectedBoard });
      }

      // 2. Update Account (Personal Info & Password)
      const payload: any = {};
      if (email && email !== user?.email) payload.email = email;
      if (fullName && fullName !== user?.full_name) payload.full_name = fullName;
      if (username && username !== user?.username) payload.username = username;
      if (newPassword) {
        if (newPassword !== confirmPassword) throw new Error('Passwords do not match');
        payload.password = newPassword;
      }
      
      if (Object.keys(payload).length > 0) {
        await updateAccount(payload);
      }

      alert('Profile updated successfully');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.headerProfile}>
        <Avatar.Icon size={80} icon="account" style={{ backgroundColor: theme.colors.primaryContainer }} />
        <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginTop: 12 }}>{displayName}</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.secondary }}>{user?.email}</Text>
        <Chip style={{ marginTop: 8 }} textStyle={{fontSize: 10}} compact>{user?.role === 'admin' ? 'Admin' : 'Student'}</Chip>
      </View>

      {/* Academic Details */}
      <View style={styles.sectionContainer}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Academic Details</Text>
        <View style={styles.inputGroup}>
          <Text variant="bodySmall" style={{marginBottom: 8, color: theme.colors.outline}}>Class</Text>
          <View style={styles.chipContainer}>
            {CLASSES.map((cls) => (
              <Chip
                key={cls}
                selected={selectedClass === cls}
                onPress={() => setSelectedClass(cls)}
                style={[styles.chip, selectedClass === cls && { backgroundColor: theme.colors.secondaryContainer }]}
                showSelectedOverlay
                compact
              >
                {cls}
              </Chip>
            ))}
          </View>

          <Text variant="bodySmall" style={{marginTop: 16, marginBottom: 8, color: theme.colors.outline}}>Board</Text>
          <View style={styles.chipContainer}>
            {BOARDS.map((board) => (
              <Chip
                key={board}
                selected={selectedBoard === board}
                onPress={() => setSelectedBoard(board)}
                style={[styles.chip, selectedBoard === board && { backgroundColor: theme.colors.secondaryContainer }]}
                showSelectedOverlay
                compact
              >
                {board}
              </Chip>
            ))}
          </View>
        </View>
      </View>

      {/* Personal Info */}
      <View style={styles.sectionContainer}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Personal Information</Text>
        <View style={styles.inputGroup}>
          <TextInput
            label="Full Name"
            value={fullName}
            onChangeText={setFullName}
            mode="outlined"
            style={styles.input}
            dense
            outlineColor="transparent"
            contentStyle={{backgroundColor: theme.colors.surfaceVariant}}
          />
          <TextInput
            label="Username"
            value={username}
            onChangeText={setUsername}
            mode="outlined"
            style={styles.input}
            dense
            outlineColor="transparent"
            contentStyle={{backgroundColor: theme.colors.surfaceVariant}}
          />
          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
            dense
            outlineColor="transparent"
            contentStyle={{backgroundColor: theme.colors.surfaceVariant}}
          />
        </View>
      </View>

      {/* Security */}
      <View style={styles.sectionContainer}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Security</Text>
        <View style={styles.inputGroup}>
          <TextInput
            label="New Password (Optional)"
            value={newPassword}
            onChangeText={setNewPassword}
            mode="outlined"
            secureTextEntry
            style={styles.input}
            dense
            outlineColor="transparent"
            contentStyle={{backgroundColor: theme.colors.surfaceVariant}}
          />
          {newPassword ? (
            <TextInput
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              mode="outlined"
              secureTextEntry
              style={styles.input}
              dense
              outlineColor="transparent"
              contentStyle={{backgroundColor: theme.colors.surfaceVariant}}
            />
          ) : null}
        </View>
      </View>

      {error ? (
        <View style={{backgroundColor: theme.colors.errorContainer, padding: 12, borderRadius: 8, marginBottom: 16}}>
          <Text style={{ color: theme.colors.onErrorContainer }}>{error}</Text>
        </View>
      ) : null}

      <Button
        mode="contained"
        onPress={handleSaveAll}
        loading={loading}
        style={styles.saveButton}
        contentStyle={{ paddingVertical: 8 }}
        icon="content-save"
      >
        Save Changes
      </Button>

      {user?.role === 'admin' && (
        <Button mode="outlined" onPress={() => router.push('/(admin)/dashboard')} style={{ marginTop: 16 }}>
          Admin Dashboard
        </Button>
      )}

      <Button
        mode="text"
        onPress={signOut}
        style={{ marginTop: 16, marginBottom: 40 }}
        textColor={theme.colors.error}
      >
        Log Out
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 40,
  },
  headerProfile: {
    alignItems: 'center',
    marginBottom: 32,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 12,
    fontWeight: 'bold',
    opacity: 0.7,
    marginLeft: 4,
  },
  inputGroup: {
    backgroundColor: 'transparent', // Make it cleaner
  },
  input: {
    marginBottom: 12,
    backgroundColor: 'transparent',
    borderRadius: 12,
    overflow: 'hidden',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 20,
  },
  saveButton: {
    borderRadius: 12,
    marginTop: 8,
    elevation: 4,
  },
});
