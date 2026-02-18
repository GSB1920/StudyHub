import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

export default function AccessRevoked() {
  const { signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Surface style={styles.card} elevation={4}>
        <MaterialCommunityIcons name="shield-lock-outline" size={64} color="#dc3545" style={styles.icon} />
        <Text variant="headlineMedium" style={styles.title}>Access Revoked</Text>
        <Text variant="bodyLarge" style={styles.message}>
          Your access to this application has been temporarily suspended by the administrator.
        </Text>
        <Text variant="bodyMedium" style={styles.subMessage}>
          If you believe this is a mistake, please contact support.
        </Text>
        
        <Button 
          mode="outlined" 
          onPress={signOut}
          style={styles.button}
          textColor="#dc3545"
        >
          Sign Out
        </Button>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  card: {
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'white',
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    color: '#495057',
    marginBottom: 8,
  },
  subMessage: {
    textAlign: 'center',
    color: '#6c757d',
    marginBottom: 32,
  },
  button: {
    width: '100%',
    borderColor: '#dc3545',
  },
});
