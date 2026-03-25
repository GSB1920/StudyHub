
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button, Text, Surface, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { dataService } from '../../lib/appwrite';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const { signIn } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout')), 12000));
      await Promise.race([signIn(email, password), timeout]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email) {
      setError('Enter your email to reset password');
      return;
    }
    const { error } = await dataService.resetPassword(email);
    if (error) {
      setError(error.message);
      return;
    }
    setError('');
    alert('Password reset link sent if available.');
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    const { error } = await dataService.oauth(provider);
    if (error) {
      alert(error.message);
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
            Welcome Back
          </Text>
          <Text variant="bodyLarge" style={{ color: theme.colors.secondary, marginTop: 8 }}>
            Login to continue learning
          </Text>
        </View>

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

        {error ? (
          <Surface style={{backgroundColor: theme.colors.errorContainer, padding: 10, borderRadius: 8, marginBottom: 15}} elevation={0}>
             <Text style={{ color: theme.colors.onErrorContainer, textAlign: 'center' }}>{error}</Text>
          </Surface>
        ) : null}

        <Button 
          mode="contained" 
          onPress={handleLogin} 
          loading={loading} 
          style={styles.button}
          contentStyle={{ paddingVertical: 8 }}
          labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
        >
          Login
        </Button>

        <TouchableOpacity onPress={handleForgot} style={{ alignSelf: 'flex-end', marginBottom: 12 }}>
          <Text variant="bodySmall" style={{ color: theme.colors.primary }}>Forgot Password?</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 8 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.outlineVariant }} />
          <Text style={{ marginHorizontal: 8, color: theme.colors.onSurfaceVariant }}>or continue with</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.outlineVariant }} />
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
          <Button mode="outlined" icon="google" style={{ flex: 1 }} onPress={() => handleOAuth('google')}>Google</Button>
          <Button mode="outlined" icon="github" style={{ flex: 1 }} onPress={() => handleOAuth('github')}>GitHub</Button>
        </View>

        <View style={styles.footer}>
          <Text variant="bodyMedium" style={{color: theme.colors.onSurfaceVariant}}>Don&apos;t have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
            <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
              Sign Up
            </Text>
          </TouchableOpacity>
        </View>
        
        <Text variant="bodySmall" style={{ textAlign: 'center', marginTop: 30, color: theme.colors.outline }}>
          StudyHub v1.0
        </Text>
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
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
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
