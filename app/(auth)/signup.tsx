
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button, Text, Surface, useTheme, Chip } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { dataService } from '../../lib/appwrite';
import { LinearGradient } from 'expo-linear-gradient';

export default function SignupScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [experience, setExperience] = useState<'Beginner' | 'Intermediate' | 'Advanced' | null>(null);
  const router = useRouter();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async () => {
    try {
      setLoading(true);
      setError('');

      if (!fullName || !email || !password || !confirmPassword) {
        throw new Error('Please fill in all fields');
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }
      
      const { data, error } = await dataService.signup(email, password, fullName);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (data) {
         // Auto login after signup if email confirmation is disabled
         alert('Account created successfully!');
         // router.push('/(auth)/login'); // No need to push, AuthContext should pick up session
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <LinearGradient colors={[theme.colors.primary, theme.colors.primaryContainer]} style={styles.headerShape} />
      <Surface style={styles.card} elevation={2}>
        <View style={styles.header}>
          <Text variant="displaySmall" style={{ color: theme.colors.primary, fontWeight: '800' }}>
            Get Started
          </Text>
          <Text variant="bodyLarge" style={{ color: theme.colors.secondary, marginTop: 8 }}>
            Create your free account
          </Text>
        </View>


        <TextInput
          label="Full Name"
          value={fullName}
          onChangeText={setFullName}
          mode="outlined"
          style={styles.input}
          left={<TextInput.Icon icon="account" color={theme.colors.primary} />}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
        />

        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          mode="outlined"
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          left={<TextInput.Icon icon="email" color={theme.colors.primary} />}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
        />
        
        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          mode="outlined"
          style={styles.input}
          secureTextEntry={secureTextEntry}
          left={<TextInput.Icon icon="lock" color={theme.colors.primary} />}
          right={<TextInput.Icon icon={secureTextEntry ? "eye" : "eye-off"} onPress={() => setSecureTextEntry(!secureTextEntry)} />}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
        />

        <TextInput
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          mode="outlined"
          style={styles.input}
          secureTextEntry={secureTextEntry}
          left={<TextInput.Icon icon="lock-check" color={theme.colors.primary} />}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
        />

        {error ? (
          <Surface style={{backgroundColor: theme.colors.errorContainer, padding: 10, borderRadius: 8, marginBottom: 15}} elevation={0}>
             <Text style={{ color: theme.colors.onErrorContainer, textAlign: 'center' }}>{error}</Text>
          </Surface>
        ) : null}

        <Button 
          mode="contained" 
          onPress={handleSignup} 
          loading={loading} 
          style={styles.button}
          contentStyle={{ paddingVertical: 8 }}
          labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
        >
          Create Account
        </Button>

        <View style={styles.footer}>
          <Text variant="bodyMedium" style={{color: theme.colors.onSurfaceVariant}}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
              Log In
            </Text>
          </TouchableOpacity>
        </View>
      </Surface>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  headerShape: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 180,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  card: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // Glass-like opacity
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  input: {
    marginBottom: 16,
    backgroundColor: 'white',
  },
  button: {
    marginTop: 8,
    marginBottom: 24,
    borderRadius: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
