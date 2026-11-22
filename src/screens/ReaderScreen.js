import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  chapterPageUrls,
  extractChapterPage,
  getChapterDetail,
  getChapterList,
  normalizeChapter,
} from '../api/client';
import colors from '../theme';
import Loading from '../components/common/Loading';

// Rasio darurat saat dimensi asli belum/gagal terukur. Gambar tetap
// dirender penuh (contain) sehingga layar tidak pernah blank hitam —
// hanya proporsi bingkai yang menyesuaikan setelah ukuran asli ketemu.
const FALLBACK_ASPECT = 0.7;

// Satu halaman komik: lebar SELALU angka pasti (bukan persen) supaya
// Yoga tidak gagal resolve ukuran di dalam ScrollView. Tinggi mengikuti
// aspectRatio dimensi asli + resizeMode contain supaya tidak ter-crop.
function ReaderPage({ uri, pageWidth }) {
  const url =
    typeof uri === 'string' ? uri : uri?.url || uri?.image || uri?.src;
  const [aspect, setAspect] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | error
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setAspect(null);
    setStatus(url ? 'loading' : 'error');
    if (!url) return undefined;
    Image.getSize(
      url,
      (w, h) => {
        if (active && w > 0 && h > 0) setAspect(w / h);
      },
      () => {
        // Gagal ukur bukan berarti gagal tampil: pakai rasio darurat,
        // keberhasilan final ditentukan oleh onLoad/onError Image.
        if (active) setAspect(FALLBACK_ASPECT);
      }
    );
    return () => {
      active = false;
    };
  }, [url, attempt]);

  const ratio = aspect ?? FALLBACK_ASPECT;

  return (
    <View style={[styles.page, { width: pageWidth, aspectRatio: ratio }]}>
      <Image
        key={`${url}-${attempt}`}
        source={{ uri: url }}
        resizeMode="contain"
        style={{ width: pageWidth, aspectRatio: ratio }}
        onLoad={() => setStatus('ok')}
        onError={() => setStatus('error')}
      />
      {status === 'loading' ? (
        <View style={styles.pageOverlay}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : null}
      {status === 'error' ? (
        <Pressable
          style={styles.pageOverlay}
          onPress={() => setAttempt((a) => a + 1)}
        >
          <Text style={styles.pageErrorText}>
            Gambar gagal dimuat.{'\n'}Ketuk untuk coba lagi.
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function ReaderScreen({ route }) {
  const { mangaId, chapterId, chapter } = route.params || {};
  const { width, height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef(null);
  const pageHeights = useRef([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(
    route.params?.mode === 'horizontal' ? 'horizontal' : 'vertical'
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageUrls, setPageUrls] = useState([]);

  const loadChapters = useCallback(async () => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const idKey = (c) => String(c?.id ?? c?.chapter_number ?? c?.number ?? '');
        const findIdx = (arr) => {
          let i = arr.findIndex((c) => idKey(c) === String(chapterId));
          if (i < 0) {
            const num = Number(String(chapterId));
            i = arr.findIndex((c) => (c?.chapter_number ?? c?.number) === num);
          }
          return i;
        };
        // Muat halaman berikutnya sampai chapter tujuan ketemu
        // (daftar chapter memakai cursor pagination, 100/chapter per halaman).
        const first = extractChapterPage((await getChapterList(mangaId)).data);
        let list = first.items.map(normalizeChapter);
        let hasNext = first.hasNext;
        let cursor = first.nextCursor;
        let idx = findIdx(list);
        while (idx < 0 && hasNext && cursor) {
          const page = extractChapterPage(
            (await getChapterList(mangaId, { cursor })).data
          );
          list = [...list, ...page.items.map(normalizeChapter)];
          hasNext = page.hasNext;
          cursor = page.nextCursor;
          idx = findIdx(list);
        }
        list = [...list].sort(
          (a, b) => (b?.chapter_number ?? 0) - (a?.chapter_number ?? 0)
        );
        setChapters(list);
        idx = findIdx(list);
        if (idx < 0) idx = 0;
        setCurrentIndex(idx);
        setCurrentPage(0);
        const detailRes = await getChapterDetail(list[idx]?.id ?? chapterId);
        setPageUrls(chapterPageUrls(detailRes.data?.data ?? detailRes.data));
      } catch (e) {
        setError(e?.message || 'Gagal memuat chapter');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [mangaId, chapterId]);

  const onFocus = useCallback(() => {
    loadChapters();
  }, [loadChapters]);

  useFocusEffect(onFocus);

  const currentChapter = chapters[currentIndex] || chapter;

  // Reset scroll position only when the chapter or reading mode changes.
  // Never scroll on currentPage change: in vertical mode that would fight
  // the user's finger (scroll -> setCurrentPage -> scrollTo) and snap the
  // list back up.
  useEffect(() => {
    pageHeights.current = [];
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [currentIndex, mode]);

  const onPageLayout = (index) => (e) => {
    pageHeights.current[index] = e.nativeEvent.layout.height;
  };

  const goToChapter = (newIndex) => {
    const clamped = Math.max(0, Math.min(chapters.length - 1, newIndex));
    setCurrentIndex(clamped);
    setCurrentPage(0);
  };

  const goNext = () => {
    if (currentIndex > 0) goToChapter(currentIndex - 1);
  };

  const goPrev = () => {
    if (currentIndex < chapters.length - 1) goToChapter(currentIndex + 1);
  };

  const onScrollVertical = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    // Pages have different heights, so find the page containing a probe
    // point near the top of the viewport using measured layouts.
    const probe = y + windowHeight * 0.15;
    let top = 0;
    let idx = 0;
    for (let i = 0; i < pageUrls.length; i++) {
      if (probe >= top) idx = i;
      top += pageHeights.current[i] || 0;
    }
    setCurrentPage((prev) => (prev === idx ? prev : idx));
  };

  const onMomentumHorizontal = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx >= 0 && idx < pageUrls.length) {
      setCurrentPage(idx);
    }
  };

  const renderPage = (uri, i) => (
    <ReaderPage key={i} uri={uri} pageWidth={width} />
  );

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!currentChapter) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Chapter tidak ditemukan</Text>
      </View>
    );
  }

  if (!loading && !error && pageUrls.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Chapter ini belum memiliki halaman</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {mode === 'vertical' ? (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.verticalContent}
          onScroll={onScrollVertical}
          scrollEventThrottle={16}
        >
          {pageUrls.map((uri, i) => (
            <View key={i} onLayout={onPageLayout(i)}>
              {renderPage(uri, i)}
            </View>
          ))}
          <View style={{ height: 60 }} />
        </ScrollView>
      ) : (
        <ScrollView
          key={chapters[currentIndex]?.id ?? chapterId ?? 'chapter'}
          ref={scrollRef}
          horizontal
          pagingEnabled
          directionalLockEnabled
          style={styles.horizontalScroll}
          onMomentumScrollEnd={onMomentumHorizontal}
        >
          {pageUrls.map((uri, i) => (
            <ScrollView
              key={i}
              style={{ width }}
              contentContainerStyle={styles.horizontalPageContent}
              showsVerticalScrollIndicator={false}
            >
              {renderPage(uri, i)}
            </ScrollView>
          ))}
        </ScrollView>
      )}

      <View style={styles.controls}>
        <Pressable style={styles.controlButton} onPress={goPrev}>
          <Text style={styles.controlText}>‹ Sebelumnya</Text>
        </Pressable>
        <Pressable
          style={styles.controlButton}
          onPress={() => setMode(mode === 'vertical' ? 'horizontal' : 'vertical')}
        >
          <Text style={styles.controlText}>
            {mode === 'vertical' ? 'Mode: Horizontal' : 'Mode: Vertikal'}
          </Text>
        </Pressable>
        <Pressable style={styles.controlButton} onPress={goNext}>
          <Text style={styles.controlText}>Berikutnya ›</Text>
        </Pressable>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    color: colors.secondaryText,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  scroll: {
    flex: 1,
  },
  page: {
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  pageOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  pageErrorText: {
    color: colors.secondaryText,
    fontSize: 13,
    textAlign: 'center',
  },
  verticalContent: {
    paddingTop: 0,
  },
  horizontalScroll: {
    flex: 1,
  },
  horizontalPageContent: {
    flexGrow: 1,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  controlButton: {
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  controlText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
});
