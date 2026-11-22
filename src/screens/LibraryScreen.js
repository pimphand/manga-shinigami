import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppButton from '../components/common/AppButton';
import Loading from '../components/common/Loading';
import { useLibrary } from '../context/LibraryContext';
import MangaCard from '../components/MangaCard';
import { getMangaDetail } from '../api/client';
import colors from '../theme';

const PAGE_SIZE = 10;

function timeAgo(input) {
  const time = new Date(input).getTime();
  if (Number.isNaN(time)) return '';
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit yang lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam yang lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari yang lalu`;
  return new Date(time).toLocaleDateString();
}

export default function LibraryScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { favorites, history, clearHistory } = useLibrary();
  const [favManga, setFavManga] = useState([]);
  const [loadingFavs, setLoadingFavs] = useState(false);
  const [favLimit, setFavLimit] = useState(PAGE_SIZE);
  const [historyLimit, setHistoryLimit] = useState(PAGE_SIZE);

  // Satu judul tampil satu kali saja: ambil entri TERAKHIR dibaca per manga.
  // history urut terbaru dulu, jadi kemunculan pertama per mangaId menang.
  const uniqueHistory = useMemo(() => {
    const seen = new Set();
    return history.filter((h) => {
      const key = h?.mangaId != null ? String(h.mangaId) : `chapter:${h?.chapterId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [history]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (favorites.length === 0) {
        setFavManga([]);
        setLoadingFavs(false);
        return;
      }
      setLoadingFavs(true);
      const details = await Promise.all(
        favorites.map((id) =>
          getMangaDetail(id).then((r) => r.data).catch(() => null)
        )
      );
      if (!cancelled) {
        setFavManga(details.filter(Boolean));
        setLoadingFavs(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [favorites]);

  const openDetail = (manga) => {
    navigation.navigate('Home', {
      screen: 'Detail',
      params: { id: manga?.id },
    });
  };

  const openReader = (entry) => {
    navigation.navigate('Home', {
      screen: 'Reader',
      params: { mangaId: entry?.mangaId, chapterId: entry?.chapterId },
    });
  };

  const renderFavorite = ({ item }) => (
    <MangaCard manga={item} onPress={() => openDetail(item)} style={{ flex: 1 }} />
  );

  const renderHistory = ({ item }) => {
    const cover = item?.mangaCover ?? item?.cover ?? item?.thumbnail ?? null;
    const number = item?.chapterNumber ?? item?.chapter_number ?? '?';
    const chapterTitle = item?.chapterTitle || item?.chapter_title || '';
    return (
      <Pressable style={styles.historyRow} onPress={() => openReader(item)}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.historyThumb} />
        ) : (
          <View style={[styles.historyThumb, styles.historyBadge]}>
            <Text style={styles.historyBadgeText}>#{number}</Text>
          </View>
        )}
        <View style={styles.historyInfo}>
          <Text style={styles.historyTitle} numberOfLines={2}>
            {item?.mangaTitle ?? 'Manga'}
          </Text>
          <Text style={styles.historySub} numberOfLines={1}>
            Terakhir dibaca: Chapter {number}
            {chapterTitle ? ` - ${chapterTitle}` : ''}
          </Text>
          {item?.timestamp ? (
            <Text style={styles.historyTime} numberOfLines={1}>
              {timeAgo(item.timestamp)}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
    >
      <Text style={styles.sectionTitle}>Favorit</Text>
      {favorites.length === 0 ? (
        <Text style={styles.emptyText}>Belum ada manga favorit</Text>
      ) : loadingFavs ? (
        <Loading />
      ) : (
        <View style={styles.grid}>
          {favManga.slice(0, favLimit).map((item, index) => (
            <View key={item?.id ?? String(index)} style={styles.gridItem}>
              {renderFavorite({ item })}
            </View>
          ))}
        </View>
      )}
      {favManga.length > favLimit && (
        <AppButton
          title="Tampilkan lebih banyak"
          variant="outline"
          style={styles.moreButton}
          onPress={() => setFavLimit((n) => n + PAGE_SIZE)}
        />
      )}

      <View style={styles.historyHeader}>
        <Text style={styles.sectionTitle}>Riwayat Membaca</Text>
        {uniqueHistory.length > 0 ? (
          <Pressable onPress={clearHistory}>
            <Text style={styles.clearText}>Bersihkan</Text>
          </Pressable>
        ) : null}
      </View>
      {uniqueHistory.length === 0 ? (
        <Text style={styles.emptyText}>Belum ada riwayat membaca</Text>
      ) : (
        <View style={styles.historyList}>
          {uniqueHistory.slice(0, historyLimit).map((item, index) => (
            <View key={String(item?.chapterId ?? index)}>{renderHistory({ item })}</View>
          ))}
        </View>
      )}
      {uniqueHistory.length > historyLimit && (
        <AppButton
          title="Tampilkan lebih banyak"
          variant="outline"
          style={styles.moreButton}
          onPress={() => setHistoryLimit((n) => n + PAGE_SIZE)}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 16,
    backgroundColor: colors.background,
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
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 16,
  },
  clearText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
  },
  gridItem: {
    width: '50%',
    padding: 4,
  },
  historyList: {
    paddingHorizontal: 16,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyThumb: {
    width: 56,
    height: 76,
    borderRadius: 8,
    backgroundColor: colors.secondaryBackground,
    marginRight: 12,
  },
  historyBadge: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBadgeText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  historyInfo: {
    flex: 1,
  },
  historyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  historySub: {
    color: colors.secondaryText,
    fontSize: 12,
    marginTop: 4,
  },
  historyTime: {
    color: colors.inactive,
    fontSize: 11,
    marginTop: 2,
  },
  emptyText: {
    color: colors.inactive,
    textAlign: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  moreButton: {
    alignSelf: 'center',
    marginTop: 12,
  },
});
