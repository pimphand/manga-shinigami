import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HeroCarousel from '../components/HeroCarousel';
import AppButton from '../components/common/AppButton';
import Loading from '../components/common/Loading';
import colors from '../theme';
import MangaCard from '../components/MangaCard';
import { extractItems, getHome, getHomeHero, normalizeManga } from '../api/client';

export default function HomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [heroes, setHeroes] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [popular, setPopular] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadHome = useCallback(async () => {
    setRefreshing(false);
    setError(null);
    try {
      const [heroRes, homeRes] = await Promise.all([getHomeHero(), getHome()]);
      const heroItems = extractItems(heroRes.data).map(normalizeManga);
      const homeItems = extractItems(homeRes.data).map(normalizeManga);
      setHeroes(heroItems);
      setRecommendations(homeItems);
      setPopular(homeItems);
    } catch (e) {
      setError(e?.message || 'Gagal memuat beranda');
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHome();
    setRefreshing(false);
  }, [loadHome]);

  // Muat sekali saat mount; refresh berikutnya hanya via pull-to-refresh —
  // kembali ke tab Home tidak me-fetch ulang home + hero.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadHome();
  }, [loadHome]);

  const openDetail = useCallback(
    (manga) => {
      navigation.navigate('Detail', { id: manga?.id });
    },
    [navigation]
  );

  const renderManga = useCallback(
    ({ item }) => (
      <MangaCard manga={item} onPress={openDetail} style={styles.cardNarrow} />
    ),
    [openDetail]
  );

  const renderGrid = useCallback(
    ({ item }) => (
      <MangaCard manga={item} onPress={openDetail} style={styles.cardFlex} />
    ),
    [openDetail]
  );

  const keyExtractor = useCallback(
    (item, index) => item?.id ?? String(index),
    []
  );

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <AppButton title="Coba Lagi" onPress={loadHome} />
      </View>
    );
  }

  const header = (
    <View>
      {heroes.length > 0 && <HeroCarousel items={heroes} onSelect={openDetail} />}

      <Text style={styles.sectionTitle}>Rekomendasi</Text>
      {recommendations.length > 0 ? (
        <FlatList
          data={recommendations}
          renderItem={renderManga}
          keyExtractor={keyExtractor}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
        />
      ) : (
        <Text style={styles.emptyText}>Belum ada rekomendasi</Text>
      )}

      <Text style={styles.sectionTitle}>Populer</Text>
      {popular.length === 0 && (
        <Text style={styles.emptyText}>Belum ada manga populer</Text>
      )}
    </View>
  );

  return (
    <FlatList
      data={popular}
      renderItem={renderGrid}
      keyExtractor={keyExtractor}
      numColumns={2}
      ListHeaderComponent={header}
      style={styles.list}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#E6A23C"
          colors={[colors.accent]}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  cardNarrow: {
    width: 140,
  },
  cardFlex: {
    flex: 1,
  },
  list: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#000000',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    color: colors.secondaryText,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  sectionTitle: {
    alignSelf: 'flex-start',
    color: colors.background,
    backgroundColor: colors.text,
    fontSize: 16,
    fontWeight: '700',
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  horizontalList: {
    paddingHorizontal: 16,
  },
  gridList: {
    paddingHorizontal: 16,
  },
  emptyText: {
    color: colors.inactive,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
