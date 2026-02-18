import React, { useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { Text, useTheme, Avatar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const SLIDES = [
  { key: 'learn', title: 'Master Your Subjects', subtitle: 'Comprehensive lessons designed for your curriculum', icon: 'school', gradient: ['#0056b3', '#3395ff'] as const },
  { key: 'materials', title: 'Study Materials', subtitle: 'Curated notes, PDFs, and cheat sheets for quick revision', icon: 'file-document', gradient: ['#17a2b8', '#3dd5f3'] as const },
  { key: 'progress', title: 'Track Progress', subtitle: 'See your growth with streaks, goals, and achievements', icon: 'chart-line', gradient: ['#ffc107', '#ffda6a'] as const },
];

export default function Intro() {
  const theme = useTheme();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const onScroll = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / width);
    if (i !== index) setIndex(i);
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    } else {
      getStarted();
    }
  };

  const skip = async () => {
    await AsyncStorage.setItem('intro_seen', 'true');
    router.replace('/(auth)/login');
  };

  const getStarted = async () => {
    await AsyncStorage.setItem('intro_seen', 'true');
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((s) => (
          <View key={s.key} style={[styles.slide, { width }]}>
            <View style={styles.hero}>
              <LinearGradient colors={s.gradient} style={styles.circle}>
                <Avatar.Icon size={72} icon={s.icon} style={{ backgroundColor: 'transparent' }} color="#fff" />
              </LinearGradient>
            </View>
            <Text variant="headlineSmall" style={[styles.title, { color: '#000000' }]}>{s.title}</Text>
            <Text variant="bodyMedium" style={[styles.subtitle, { color: '#495057' }]}>{s.subtitle}</Text>

            <View style={styles.dots}>
              {SLIDES.map((_, i) => (
                <View key={i} style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]} />
              ))}
            </View>

            <LinearGradient colors={[theme.colors.primary, theme.colors.primaryContainer]} style={styles.primaryButton}>
              <TouchableOpacity onPress={next} style={styles.primaryButtonTouch}>
                <Text variant="titleMedium" style={styles.primaryButtonText}>{index === SLIDES.length - 1 ? 'Get Started' : 'Next'}</Text>
              </TouchableOpacity>
            </LinearGradient>

            <TouchableOpacity onPress={skip} style={styles.skip}>
              <Text variant="bodyMedium" style={{ color: '#6c757d' }}>Skip</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  hero: {
    width: 160,
    height: 160,
    borderRadius: 80,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: '#7C3AED',
  },
  dotInactive: {
    backgroundColor: '#D1D5DB',
  },
  primaryButton: {
    width: '100%',
    borderRadius: 12,
  },
  primaryButtonTouch: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  skip: {
    marginTop: 12,
  },
});
