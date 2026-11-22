import { openDatabaseAsync } from 'expo-sqlite';
import { Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { extractItems, getMangaLists, normalizeManga } from '../api/client';
import { importLibraryFromSqlite } from './importLibraryFromSqlite';

const AUTO_TMP = 'pustaka-auto-import.db';
const KOMIKINDO_TMP = 'pustaka-komikindo-import.db';
// Skor minimum agar judul Komikindo dianggap cocok dengan judul di API.
// Dibuat ketat (hanya exact/awalan/substring/irisan penuh): lebih baik
// judul dilewati (user buka manual sekali) daripada nyangkut ke komik
// yang salah. Contoh yang DITOLAK: "The Strongest Chef..." vs
// "The Strongest Assassin..." (53), "Flowery Mountain Sect" vs
// "Mount Hua Sect" (53, alias resmi tapi tetap dilewati demi aman).
const MIN_MATCH_SCORE = 60;

function normTitle(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 0..100. Exact > awalan/substring > irisan kata.
function matchScore(query, candidate) {
  const q = normTitle(query);
  const c = normTitle(candidate);
  if (!q || !c) return 0;
  if (c === q) return 100;
  if (c.startsWith(q) || q.startsWith(c)) return 80;
  if (c.includes(q) || q.includes(c)) return 60;
  const qTokens = q.split(' ');
  const cSet = new Set(c.split(' '));
  let hit = 0;
  for (const t of qTokens) if (cSet.has(t)) hit++;
  const ratio = hit / qTokens.length;
  if (ratio >= 0.6) return 40 + ratio * 20;
  return ratio * 30;
}

async function tableColumns(db, table) {
  try {
    const rows = await db.getAllAsync(`PRAGMA table_info(${table})`);
    return (rows || []).map((r) => r?.name).filter(Boolean);
  } catch {
    return null;
  }
}

async function readKomikindoRows(pickedUri) {
  const dest = `${Paths.document.uri}${KOMIKINDO_TMP}`;
  await FileSystem.copyAsync({ from: pickedUri, to: dest });
  try {
    const db = await openDatabaseAsync(KOMIKINDO_TMP, undefined, Paths.document.uri);
    try {
      let favRows = [];
      let histRows = [];
      try {
        favRows = await db.getAllAsync('SELECT title, url, image FROM favorit');
      } catch {
        favRows = null;
      }
      try {
        histRows = await db.getAllAsync(
          'SELECT title, url, image, chapter, currenttime FROM history'
        );
      } catch {
        histRows = null;
      }
      if (favRows == null && histRows == null) {
        throw new Error('File bukan database Komikindo yang valid.');
      }
      return { favRows: favRows ?? [], histRows: histRows ?? [] };
    } finally {
      await db.closeAsync();
    }
  } finally {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  }
}

// Satu judul Komikindo bisa muncul berkali-kali di history:
// ambil baris dengan waktu baca terbaru per judul.
function dedupeHistoryByTitle(rows) {
  const byTitle = new Map();
  for (const r of rows) {
    if (!r?.title) continue;
    const key = normTitle(r.title);
    if (!key) continue;
    const t = Date.parse(r?.currenttime) || 0;
    const prev = byTitle.get(key);
    if (!prev || t > prev._t) byTitle.set(key, { ...r, _t: t });
  }
  return [...byTitle.values()];
}

async function findBestMatch(title) {
  const res = await getMangaLists(title, 0);
  const candidates = extractItems(res.data)
    .map(normalizeManga)
    .filter((m) => m?.id)
    .slice(0, 10);
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const s = matchScore(title, c.title || c.name);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore >= MIN_MATCH_SCORE ? { manga: best, score: bestScore } : null;
}

function parseTimestamp(value) {
  const t = Date.parse(value);
  return Number.isNaN(t) ? Date.now() : t;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function importKomikindoLibrary(pickedUri, onProgress) {
  const { favRows, histRows } = await readKomikindoRows(pickedUri);
  const uniqueHist = dedupeHistoryByTitle(histRows);
  const uniqueFavs = [];
  {
    const seen = new Set();
    for (const r of favRows) {
      const key = normTitle(r?.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      uniqueFavs.push(r);
    }
  }

  const jobs = [
    ...uniqueHist.map((r) => ({ kind: 'history', row: r })),
    ...uniqueFavs.map((r) => ({ kind: 'favorite', row: r })),
  ];
  const favorites = [];
  const history = [];
  const unmatched = [];
  let done = 0;
  for (const job of jobs) {
    done++;
    onProgress?.({ done, total: jobs.length, title: job.row?.title });
    try {
      const hit = await findBestMatch(job.row.title);
      if (!hit) {
        unmatched.push({ title: job.row?.title, chapter: job.row?.chapter ?? null });
        continue;
      }
      const m = hit.manga;
      if (job.kind === 'favorite') {
        favorites.push(String(m.id));
      } else {
        // chapterId diisi nomor chapter mentah: Reader/Halaman detail
        // bisa membukanya lewat pencocokan chapter_number.
        const chRaw = job.row?.chapter != null ? String(job.row.chapter) : null;
        history.push({
          mangaId: String(m.id),
          mangaTitle: m.title || job.row.title,
          mangaCover: m.cover ?? job.row?.image ?? null,
          chapterId: chRaw,
          chapterNumber: chRaw,
          chapterTitle: null,
          timestamp: parseTimestamp(job.row?.currenttime),
        });
      }
    } catch {
      unmatched.push({ title: job.row?.title, chapter: job.row?.chapter ?? null });
    }
    await sleep(100);
  }

  return {
    favorites: [...new Set(favorites)],
    history,
    unmatched,
    source: 'komikindo',
  };
}

// Deteksi format lalu impor: format aplikasi ini dulu, kalau bukan
// coba format Komikindo (cocokkan judul ke API). onProgress hanya
// dipakai untuk alur Komikindo ({ done, total, title }).
export async function importLibraryAuto(pickedUri, onProgress) {
  if (!pickedUri) throw new Error('File tidak valid.');
  const dest = `${Paths.document.uri}${AUTO_TMP}`;
  await FileSystem.copyAsync({ from: pickedUri, to: dest });
  let isOurs = false;
  let isKomikindo = false;
  try {
    const db = await openDatabaseAsync(AUTO_TMP, undefined, Paths.document.uri);
    try {
      const favCols = await tableColumns(db, 'favorites');
      const histCols = await tableColumns(db, 'history');
      isOurs =
        (favCols && favCols.includes('manga_id')) ||
        (histCols && histCols.includes('chapter_id'));
      const kFavCols = await tableColumns(db, 'favorit');
      const kHistCols = await tableColumns(db, 'history');
      isKomikindo =
        (kFavCols && kFavCols.includes('url')) ||
        (kHistCols && kHistCols.includes('url'));
    } finally {
      await db.closeAsync();
    }
  } finally {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  }

  if (isOurs) {
    const data = await importLibraryFromSqlite(pickedUri);
    return { ...data, unmatched: [], source: 'shinigami' };
  }
  if (isKomikindo) {
    return await importKomikindoLibrary(pickedUri, onProgress);
  }
  throw new Error(
    'File bukan database pustaka yang valid (bukan format aplikasi ini maupun Komikindo).'
  );
}
