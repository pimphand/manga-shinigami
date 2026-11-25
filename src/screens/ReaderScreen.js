import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import {
  IMAGE_HEADERS,
  chapterPageUrls,
  extractChapterPage,
  getChapterDetail,
  getChapterList,
  normalizeChapter,
} from '../api/client';
import colors from '../theme';
import Loading from '../components/common/Loading';
import { useLibrary } from '../context/LibraryContext';

// Rasio darurat saat dimensi asli belum/gagal terukur. Gambar tetap
// dirender penuh (contain) sehingga layar tidak pernah blank hitam —
// hanya proporsi bingkai yang menyesuaikan setelah ukuran asli ketemu.
const FALLBACK_ASPECT = 0.7;

// Kecepatan auto-scroll vertikal (px per detik, interval 50ms).
const AUTO_SPEEDS = [
  { label: 'Lambat', pxPerSec: 70 },
  { label: 'Normal', pxPerSec: 140 },
  { label: 'Cepat', pxPerSec: 280 },
];

// Satu halaman komik: lebar SELALU angka pasti (bukan persen) supaya
// Yoga tidak gagal resolve ukuran di dalam ScrollView. Tinggi mengikuti
// aspectRatio dimensi asli + resizeMode contain supaya tidak ter-crop.
// spinner=true hanya untuk halaman pertama: halaman lain memakai teks
// statis agar tidak ada belasan animasi loading berjalan bersamaan.
const ReaderPage = React.memo(function ReaderPage({ uri, pageWidth, spinner, label }) {
  const url =
    typeof uri === 'string' ? uri : uri?.url || uri?.image || uri?.src;
  const [aspect, setAspect] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | error
  const [attempt, setAttempt] = useState(0);

  // Dimensi asli diambil dari event onLoad expo-image (sudah termasuk
  // cache disk) — tanpa request ukur tambahan via Image.getSize.
  useEffect(() => {
    setAspect(null);
    setStatus(url ? 'loading' : 'error');
  }, [url, attempt]);

  const ratio = aspect ?? FALLBACK_ASPECT;

  return (
    <View style={[styles.page, { width: pageWidth, aspectRatio: ratio }]}>
      <Image
        key={`${url}-${attempt}`}
        source={url ? { uri: url, headers: IMAGE_HEADERS } : undefined}
        contentFit="contain"
        cachePolicy="memory-disk"
        // allowDownscaling=false: cegah expo-image mengecilkan halaman komik
        // besar demi hemat memori — itulah penyebab utama gambar terlihat
        // blur / tidak HD. recyclingKey + priority bikin halaman terdekat
        // dimuat tajam duluan tanpa ketukar antar halaman.
        allowDownscaling={false}
        priority="high"
        recyclingKey={url}
        transition={0}
        style={{ width: pageWidth, aspectRatio: ratio }}
        onLoad={(e) => {
          const w = e?.source?.width;
          const h = e?.source?.height;
          setAspect(w > 0 && h > 0 ? w / h : FALLBACK_ASPECT);
          setStatus('ok');
        }}
        onError={() => setStatus('error')}
      />
      {status === 'loading' ? (
        <View style={styles.pageOverlay}>
          {spinner ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.pagePlaceholderText}>{label ?? '…'}</Text>
          )}
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
});

// Cache daftar chapter per manga selama sesi: komik yang sama dibuka ulang
// (atau chapter diganti) tidak perlu memindai pagination API dari awal lagi.
const chaptersCache = new Map();

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
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState(null);
  const [autoScroll, setAutoScroll] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const scrollOffsetRef = useRef(0);
  const restoredChapterRef = useRef(null);
  const progressTimerRef = useRef(null);
  const { history, updateHistoryEntry } = useLibrary();
  const historyRef = useRef(history);
  historyRef.current = history;

  const loadSeq = useRef(0);
  const pageSeq = useRef(0);

  const loadChapters = useCallback(async () => {
    const seq = ++loadSeq.current;
    const stillCurrent = () => loadSeq.current === seq;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!stillCurrent()) return;
        const idKey = (c) => String(c?.id ?? c?.chapter_number ?? c?.number ?? '');
        const findIdx = (arr) => {
          let i = arr.findIndex((c) => idKey(c) === String(chapterId));
          if (i < 0) {
            const num = Number(String(chapterId));
            i = arr.findIndex((c) => (c?.chapter_number ?? c?.number) === num);
          }
          return i;
        };
        let list = chaptersCache.get(String(mangaId));
        if (!list) {
          // Muat halaman berikutnya sampai chapter tujuan ketemu
          // (daftar chapter memakai cursor pagination, 100/chapter per halaman).
          const first = extractChapterPage((await getChapterList(mangaId)).data);
          list = first.items.map(normalizeChapter);
          let hasNext = first.hasNext;
          let cursor = first.nextCursor;
          let idx = findIdx(list);
          while (idx < 0 && hasNext && cursor && stillCurrent()) {
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
          chaptersCache.set(String(mangaId), list);
        }
        if (!stillCurrent()) return;
        setChapters(list);
        let idx = findIdx(list);
        if (idx < 0) idx = 0;
        setCurrentIndex(idx);
        setCurrentPage(0);
        // Halaman gambar dimuat oleh efek loadPages di bawah, supaya
        // tombol Sebelumnya/Berikutnya (yang hanya mengubah currentIndex)
        // ikut memuat ulang gambar chapter yang baru.
      } catch (e) {
        if (stillCurrent()) setError(e?.message || 'Gagal memuat chapter');
      } finally {
        if (stillCurrent()) setLoading(false);
      }
    };
    load();
  }, [mangaId, chapterId]);

  // Fetch hanya saat manga/chapter berganti (termasuk navigasi ke chapter
  // lain tanpa unmount), BUKAN setiap layar difokuskan — kembali dari
  // layar lain tidak memuat ulang semuanya.
  useEffect(() => {
    loadChapters();
    return () => {
      loadSeq.current++;
    };
  }, [loadChapters]);

  // Muat gambar setiap kali chapter aktif berganti (awal + next/prev).
  // Sebelumnya pageUrls hanya diisi sekali saat mount, sehingga
  // goNext/goPrev mengganti currentIndex tapi gambar tetap milik chapter
  // lama (terlihat seperti error / tidak pindah chapter).
  const loadPages = useCallback(async () => {
    if (!chapters.length) return;
    const target = chapters[currentIndex];
    const targetId = target?.id ?? chapterId;
    if (targetId == null || targetId === '') {
      setPageUrls([]);
      setPageError('ID chapter tidak valid');
      return;
    }
    const seq = ++pageSeq.current;
    const stillCurrent = () => pageSeq.current === seq;
    setPageLoading(true);
    setPageError(null);
    setCurrentPage(0);
    try {
      const detailRes = await getChapterDetail(targetId);
      if (!stillCurrent()) return;
      setPageUrls(chapterPageUrls(detailRes.data?.data ?? detailRes.data));
    } catch (e) {
      if (stillCurrent()) {
        setPageUrls([]);
        setPageError(e?.message || 'Gagal memuat halaman chapter');
      }
    } finally {
      if (stillCurrent()) setPageLoading(false);
    }
  }, [chapters, currentIndex, chapterId]);

  useEffect(() => {
    loadPages();
    return () => {
      pageSeq.current++;
    };
  }, [loadPages]);

  const currentChapter = chapters[currentIndex] || chapter;

  // Prefetch 2 halaman ke depan (dengan header CDN yang sama) supaya saat
  // discroll gambar HD sudah ada di cache disk — tidak sempat tampil blur.
  useEffect(() => {
    if (!pageUrls.length) return;
    const next = pageUrls.slice(currentPage + 1, currentPage + 3);
    if (!next.length) return;
    next.forEach((u) => {
      Image.prefetch(u, { headers: IMAGE_HEADERS }).catch(() => {});
    });
  }, [currentPage, pageUrls]);

  // Reset scroll position only when the chapter or reading mode changes.
  // Never scroll on currentPage change: in vertical mode that would fight
  // the user's finger (scroll -> setCurrentPage -> scrollTo) and snap the
  // list back up.
  useEffect(() => {
    pageHeights.current = [];
    scrollOffsetRef.current = 0;
    const ref = scrollRef.current;
    try {
      if (ref?.scrollToOffset) ref.scrollToOffset({ offset: 0, animated: false });
      else if (ref?.scrollTo) ref.scrollTo({ x: 0, y: 0, animated: false });
    } catch (e) {
      // Abaikan: list mungkin belum ter-mount saat chapter berganti.
    }
  }, [currentIndex, mode, pageUrls.length]);

  // Auto-scroll hanya untuk mode vertikal.
  useEffect(() => {
    if (mode !== 'vertical') setAutoScroll(false);
  }, [mode]);

  useEffect(() => {
    if (!autoScroll || mode !== 'vertical' || pageLoading || pageUrls.length === 0) {
      return;
    }
    const step = AUTO_SPEEDS[speedIdx].pxPerSec / 20;
    const id = setInterval(() => {
      const ref = scrollRef.current;
      if (!ref?.scrollToOffset) return;
      const next = scrollOffsetRef.current + step;
      scrollOffsetRef.current = next;
      try {
        ref.scrollToOffset({ offset: next, animated: false });
      } catch (e) {
        // Abaikan: list belum siap.
      }
    }, 50);
    return () => clearInterval(id);
  }, [autoScroll, mode, speedIdx, pageLoading, pageUrls.length]);

  // Update riwayat tiap chapter aktif berganti, supaya "Lanjutkan Baca"
  // tidak basi (sebelumnya history hanya ditulis dari DetailScreen).
  // Progres halaman lama chapter baru ikut dipulihkan (currentPage).
  useEffect(() => {
    if (!chapters.length) return;
    const target = chapters[currentIndex];
    if (!target) return;
    const targetId = target?.id ?? chapterId;
    const saved = historyRef.current.find(
      (h) =>
        String(h?.mangaId) === String(mangaId) &&
        String(h?.chapterId) === String(targetId)
    );
    restoredChapterRef.current = null;
    updateHistoryEntry(mangaId, {
      chapterId: targetId,
      chapterNumber: target?.chapter_number ?? target?.number ?? null,
      chapterTitle: target?.chapter_title || target?.title || null,
      mangaTitle: route.params?.mangaTitle,
      mangaCover: route.params?.mangaCover,
      currentPage: saved?.currentPage ?? 0,
      totalPages: pageUrls.length || saved?.totalPages || 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, chapters, mangaId]);

  // Simpan progres halaman (debounce 800ms, hanya halaman > 0 supaya
  // reset ke 0 saat ganti chapter tidak menimpa progres tersimpan).
  useEffect(() => {
    if (!chapters.length || !pageUrls.length || currentPage <= 0) return;
    const target = chapters[currentIndex];
    if (!target) return;
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = setTimeout(() => {
      updateHistoryEntry(mangaId, {
        chapterId: target?.id ?? chapterId,
        chapterNumber: target?.chapter_number ?? target?.number ?? null,
        chapterTitle: target?.chapter_title || target?.title || null,
        currentPage,
        totalPages: pageUrls.length,
      });
    }, 800);
    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, [currentPage, currentIndex, chapters, pageUrls.length, mangaId, chapterId, updateHistoryEntry]);

  // Kembalikan posisi ke halaman terakhir yang dibaca setelah gambar
  // chapter termuat (sekali per chapter).
  useEffect(() => {
    if (!pageUrls.length || pageLoading) return;
    const target = chapters[currentIndex];
    const targetId = target?.id ?? chapterId;
    if (restoredChapterRef.current === String(targetId)) return;
    const saved = historyRef.current.find(
      (h) =>
        String(h?.mangaId) === String(mangaId) &&
        String(h?.chapterId) === String(targetId)
    );
    const savedPage = Number(saved?.currentPage ?? 0);
    if (!savedPage || savedPage <= 0 || savedPage >= pageUrls.length) {
      restoredChapterRef.current = String(targetId);
      return;
    }
    restoredChapterRef.current = String(targetId);
    setCurrentPage(savedPage);
    if (mode === 'horizontal') {
      const ref = scrollRef.current;
      try {
        ref?.scrollToOffset?.({ offset: width * savedPage, animated: false });
      } catch (e) {
        // Abaikan.
      }
      return;
    }
    // Vertikal: coba scrollToIndex, fallback estimasi offset bila item
    // jauh belum terukur (ditangani juga di onScrollToIndexFailed).
    let attempts = 0;
    const tryScroll = () => {
      const ref = scrollRef.current;
      if (!ref) return;
      try {
        ref.scrollToIndex({ index: savedPage, animated: false });
      } catch (e) {
        if (attempts < 3) {
          attempts += 1;
          let top = 0;
          for (let i = 0; i < savedPage; i++) top += pageHeights.current[i] || windowHeight;
          try {
            ref.scrollToOffset?.({ offset: top, animated: false });
          } catch (e2) {
            // Abaikan.
          }
          setTimeout(tryScroll, 400);
        }
      }
    };
    const t = setTimeout(tryScroll, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageUrls, pageLoading, currentIndex, chapters, mode]);

  const onPageLayout = (index) => (e) => {
    pageHeights.current[index] = e.nativeEvent.layout.height;
  };

  const goToChapter = (newIndex) => {
    if (!chapters.length || pageLoading) return;
    const clamped = Math.max(0, Math.min(chapters.length - 1, newIndex));
    if (clamped === currentIndex) return;
    setCurrentIndex(clamped);
    setCurrentPage(0);
  };

  const goNext = () => {
    if (currentIndex > 0) goToChapter(currentIndex - 1);
  };

  const goPrev = () => {
    if (currentIndex < chapters.length - 1) goToChapter(currentIndex + 1);
  };

  const canGoNext = chapters.length > 0 && currentIndex > 0 && !pageLoading;
  const canGoPrev =
    chapters.length > 0 && currentIndex < chapters.length - 1 && !pageLoading;

  const onScrollVertical = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollOffsetRef.current = y;
    // Mentok bawah: hentikan auto-scroll.
    const { layoutMeasurement, contentSize } = e.nativeEvent;
    if (
      autoScroll &&
      layoutMeasurement &&
      contentSize &&
      layoutMeasurement.height + y >= contentSize.height - 60
    ) {
      setAutoScroll(false);
    }
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

  const onScrollBeginDrag = () => {
    // Sentuhan manual menghentikan auto-scroll supaya tidak berebut.
    if (autoScroll) setAutoScroll(false);
  };

  const onScrollToIndexFailed = (info) => {
    // Item jauh belum terukur: scroll ke estimasi offset lalu coba lagi.
    const ref = scrollRef.current;
    if (!ref?.scrollToOffset) return;
    const avg = info?.averageItemLength || windowHeight;
    const estimated = avg * (info?.index ?? 0);
    scrollOffsetRef.current = estimated;
    try {
      ref.scrollToOffset({ offset: estimated, animated: false });
    } catch (e) {
      // Abaikan.
    }
    setTimeout(() => {
      try {
        ref.scrollToIndex?.({ index: info?.index ?? 0, animated: false });
      } catch (e) {
        // Abaikan.
      }
    }, 400);
  };

  const onMomentumHorizontal = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx >= 0 && idx < pageUrls.length) {
      setCurrentPage(idx);
    }
  };

  // Virtualisasi: hanya halaman di sekitar viewport yang di-mount.
  // ReaderPage di-memo (props: uri + pageWidth stabil) sehingga scroll
  // tidak me-render ulang halaman yang sudah tampil.
  const renderPageItem = useCallback(
    ({ item: uri, index }) => (
      <View onLayout={onPageLayout(index)}>
        <ReaderPage
          uri={uri}
          pageWidth={width}
          spinner={index === 0}
          label={`Halaman ${index + 1}`}
        />
      </View>
    ),
    [width]
  );

  const renderHorizontalItem = useCallback(
    ({ item: uri, index }) => (
      <ScrollView
        style={{ width }}
        contentContainerStyle={styles.horizontalPageContent}
        showsVerticalScrollIndicator={false}
      >
        <ReaderPage
          uri={uri}
          pageWidth={width}
          spinner={index === 0}
          label={`Halaman ${index + 1}`}
        />
      </ScrollView>
    ),
    [width]
  );

  const pageKeyExtractor = useCallback((_, index) => String(index), []);

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={loadChapters}>
          <Text style={styles.retryText}>Coba lagi</Text>
        </Pressable>
      </View>
    );
  }

  if (!currentChapter && !loading && !error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Chapter tidak ditemukan</Text>
      </View>
    );
  }

  const chapterLabel =
    currentChapter?.chapter_number ?? currentChapter?.number ?? '';
  const pageIndicator =
    pageUrls.length > 0 ? `${currentPage + 1}/${pageUrls.length}` : '';

  const renderReaderBody = () => {
    if (pageLoading) {
      return <Loading />;
    }
    if (pageError) {
      return (
        <View style={styles.center}>
          <Text style={styles.errorText}>{pageError}</Text>
          <Pressable style={styles.retryButton} onPress={loadPages}>
            <Text style={styles.retryText}>Coba lagi</Text>
          </Pressable>
        </View>
      );
    }
    if (pageUrls.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={styles.errorText}>Chapter ini belum memiliki halaman</Text>
        </View>
      );
    }
    if (mode === 'vertical') {
      return (
        <FlatList
          ref={scrollRef}
          data={pageUrls}
          renderItem={renderPageItem}
          keyExtractor={pageKeyExtractor}
          style={styles.scroll}
          contentContainerStyle={styles.verticalContent}
          onScroll={onScrollVertical}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollToIndexFailed={onScrollToIndexFailed}
          scrollEventThrottle={16}
          windowSize={5}
          maxToRenderPerBatch={2}
          initialNumToRender={2}
          removeClippedSubviews
          ListFooterComponent={<View style={{ height: 60 }} />}
        />
      );
    }
    return (
      <FlatList
        key={chapters[currentIndex]?.id ?? chapterId ?? 'chapter'}
        ref={scrollRef}
        data={pageUrls}
        renderItem={renderHorizontalItem}
        keyExtractor={pageKeyExtractor}
        horizontal
        pagingEnabled
        directionalLockEnabled
        style={styles.horizontalScroll}
        onMomentumScrollEnd={onMomentumHorizontal}
        windowSize={5}
        maxToRenderPerBatch={2}
        initialNumToRender={1}
        removeClippedSubviews
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
      />
    );
  };

  return (
    <View style={styles.container}>
      {chapterLabel !== '' ? (
        <View style={styles.infoBar}>
          <Text style={styles.infoText}>
            Ch. {chapterLabel}
            {pageIndicator ? ` • Hal. ${pageIndicator}` : ''}
          </Text>
        </View>
      ) : null}
      <View style={styles.body}>{renderReaderBody()}</View>

      <View style={styles.autoBar}>
        <Pressable
          style={[
            styles.autoToggle,
            autoScroll && styles.autoToggleOn,
            (mode !== 'vertical' || pageUrls.length === 0 || pageLoading) &&
              styles.controlDisabled,
          ]}
          onPress={() => {
            if (mode !== 'vertical') return;
            setAutoScroll((v) => !v);
          }}
          disabled={mode !== 'vertical' || pageUrls.length === 0 || pageLoading}
        >
          <Text
            style={[styles.autoToggleText, autoScroll && styles.autoToggleTextOn]}
          >
            {autoScroll ? '❚❚ Stop' : '▶ Auto'}
          </Text>
        </Pressable>
        <View style={styles.speedRow}>
          {AUTO_SPEEDS.map((s, i) => (
            <Pressable
              key={s.label}
              style={[styles.speedChip, i === speedIdx && styles.speedChipActive]}
              onPress={() => setSpeedIdx(i)}
            >
              <Text
                style={[styles.speedText, i === speedIdx && styles.speedTextActive]}
              >
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {mode !== 'vertical' ? (
          <Text style={styles.autoHint}>Auto hanya mode vertikal</Text>
        ) : null}
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.controlButton, !canGoPrev && styles.controlDisabled]}
          onPress={goPrev}
          disabled={!canGoPrev}
        >
          <Text
            style={[styles.controlText, !canGoPrev && styles.controlTextDisabled]}
          >
            ‹ Sebelumnya
          </Text>
        </Pressable>
        <Pressable
          style={styles.controlButton}
          onPress={() => setMode(mode === 'vertical' ? 'horizontal' : 'vertical')}
        >
          <Text style={styles.controlText}>
            {mode === 'vertical' ? 'Mode: Horizontal' : 'Mode: Vertikal'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.controlButton, !canGoNext && styles.controlDisabled]}
          onPress={goNext}
          disabled={!canGoNext}
        >
          <Text
            style={[styles.controlText, !canGoNext && styles.controlTextDisabled]}
          >
            Berikutnya ›
          </Text>
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
  pagePlaceholderText: {
    color: colors.inactive,
    fontSize: 13,
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
  controlDisabled: {
    opacity: 0.4,
  },
  controlTextDisabled: {
    opacity: 0.6,
  },
  infoBar: {
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  infoText: {
    color: colors.secondaryText,
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
  retryButton: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  autoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 10,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  autoToggle: {
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  autoToggleOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  autoToggleText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  autoToggleTextOn: {
    color: '#000',
  },
  speedRow: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  speedChip: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.card,
  },
  speedChipActive: {
    backgroundColor: colors.accent,
  },
  speedText: {
    color: colors.secondaryText,
    fontSize: 11,
    fontWeight: '600',
  },
  speedTextActive: {
    color: '#000',
  },
  autoHint: {
    color: colors.inactive,
    fontSize: 10,
  },
});
