
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ImageBackground } from 'react-native';
import { Text, Surface, useTheme, Avatar, IconButton, ProgressBar, MD3Theme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { dataService } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

interface Subject {
  id: string;
  name: string;
  icon: string;
}

export default function DashboardScreen() {
  const { user, signOut } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const theme = useTheme();
  const router = useRouter();
  const displayName = user?.full_name || (user?.email ? user.email.split('@')[0] : 'Student');

  const [recentProgress, setRecentProgress] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadSubjects(), loadRecentProgress()]);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadSubjects(), loadRecentProgress()]);
    setRefreshing(false);
  };

  const loadSubjects = async () => {
    try {
      const { data } = await dataService.getSubjects(user?.class, user?.board);
      setSubjects((data || []) as Subject[]);
    } catch (e) {
      console.error(e);
    }
  };

  const loadRecentProgress = async () => {
    if (!user) return;
    const { data } = await dataService.getRecentMaterials(user.id);
    setRecentProgress(data || []);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const renderHeader = () => (
    <View>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyMedium" style={{ color: theme.colors.secondary, marginBottom: 2 }}>
            {getGreeting()},
          </Text>
          <Text variant="headlineSmall" numberOfLines={1} style={{ color: theme.colors.onBackground, fontWeight: 'bold' }}>
            {displayName}
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(app)/profile')} style={{ marginLeft: 16 }}>
          <Avatar.Icon size={48} icon="account" style={{ backgroundColor: theme.colors.primaryContainer }} />
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
           <View style={[styles.statIcon, { backgroundColor: theme.colors.primaryContainer }]}>
             <Text style={{fontSize: 20}}>📚</Text>
           </View>
           <View>
             <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{recentProgress.length}</Text>
             <Text variant="bodySmall" style={{ color: theme.colors.outline }}>Active Reads</Text>
           </View>
        </View>
        <View style={styles.statItem}>
           <View style={[styles.statIcon, { backgroundColor: theme.colors.secondaryContainer }]}>
             <Text style={{fontSize: 20}}>🎓</Text>
           </View>
           <View>
             <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{subjects.length}</Text>
             <Text variant="bodySmall" style={{ color: theme.colors.outline }}>Subjects</Text>
           </View>
        </View>
      </View>

      {/* Continue Learning Section */}
      {recentProgress.length > 0 && (
        <View style={{ marginBottom: 32 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
            <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Continue Learning</Text>
            {/* <TouchableOpacity><Text style={{ color: theme.colors.primary }}>See All</Text></TouchableOpacity> */}
          </View>
          <FlatList
            data={recentProgress}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.continueCard, { backgroundColor: theme.colors.elevation.level1 }]}
                onPress={() => {
                   if (item.material?.type === 'pdf' && item.material?.url) {
                      router.push({
                          pathname: '/(app)/pdf-viewer',
                          params: { url: item.material.url, title: item.material.title, materialId: item.material.id }
                      });
                   }
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
                   <View style={[styles.miniIcon, { backgroundColor: theme.colors.secondaryContainer }]}>
                      <Avatar.Icon size={24} icon="file-document-outline" style={{backgroundColor: 'transparent'}} color={theme.colors.onSecondaryContainer} />
                   </View>
                   <View style={{ flex: 1, marginLeft: 12 }}>
                     <Text variant="titleSmall" numberOfLines={2} style={{ fontWeight: 'bold', marginBottom: 4 }}>{item.material?.title}</Text>
                     <Text variant="labelSmall" style={{ color: theme.colors.outline }}>
                        {new Date(item.last_accessed).toLocaleDateString()}
                     </Text>
                   </View>
                </View>
                <ProgressBar progress={0.4} color={theme.colors.primary} style={{ height: 4, borderRadius: 2 }} />
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <Text variant="titleLarge" style={styles.sectionTitle}>Your Subjects</Text>
    </View>
  );

  const renderSubject = ({ item, index }: { item: Subject, index: number }) => {
    const isWide = index === 0;
    
    return (
      <TouchableOpacity 
        style={[styles.cardContainer, isWide ? styles.cardWide : styles.cardSquare]}
        onPress={() => router.push(`/(app)/subject/${item.id}?name=${item.name}`)}
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={isWide ? [theme.colors.primary, theme.colors.tertiary] : [theme.colors.surfaceVariant, theme.colors.surfaceVariant]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.cardGradient]}
        >
          <View style={styles.cardContent}>
             <View style={[styles.iconContainer, isWide && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
               <Avatar.Icon 
                 size={32} 
                 icon={item.icon} 
                 style={{ backgroundColor: 'transparent' }} 
                 color={isWide ? 'white' : theme.colors.primary}
               />
             </View>
             <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <Text variant={isWide ? "headlineSmall" : "titleMedium"} style={{ color: isWide ? 'white' : theme.colors.onSurface, fontWeight: 'bold' }}>
                  {item.name}
                </Text>
                {isWide && (
                  <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
                    12 Topics • 85% Done
                  </Text>
                )}
             </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={subjects}
        renderItem={renderSubject}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContainer}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 16,
    marginBottom: 32,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    marginBottom: 16,
    paddingHorizontal: 20,
    fontWeight: 'bold',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    gap: 12,
  },
  cardContainer: {
    marginBottom: 12,
    borderRadius: 24,
    overflow: 'hidden',
  },
  cardWide: {
    width: '100%',
    height: 160,
  },
  cardSquare: {
    flex: 1,
    height: 160,
  },
  cardGradient: {
    flex: 1,
    padding: 20,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'column', 
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  continueCard: {
    width: 240,
    padding: 16,
    borderRadius: 20,
    marginRight: 12,
    marginBottom: 4, // for shadow visibility if added
  },
  miniIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  }
});
