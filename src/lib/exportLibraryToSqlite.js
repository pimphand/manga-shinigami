import { openDatabaseAsync } from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';

function pad(n) {
  return String(n).padStart(2, '0');
}

function timestampSuffix(date = new Date()) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function toTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

/**
 * Export favorites + reading history into a SQLite .db file
 * stored in the app document directory.
 * @returns {{ uri: string, fileName: string, favorites: number, history: number }}
 */
export async function exportLibraryToSqlite({ favorites = [], history = [] } = {}) {
  const fileName = `pustaka-${timestampSuffix()}.db`;
  const db = await openDatabaseAsync(fileName, undefined, Paths.document.uri);
  try {
    // Single-file DB (no WAL sidecar) so the shared .db is self-contained.
    await db.execAsync('PRAGMA journal_mode = DELETE;');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS favorites (
        manga_id TEXT PRIMARY KEY,
        added_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS history (
        chapter_id TEXT PRIMARY KEY,
        manga_id TEXT,
        manga_title TEXT,
        manga_cover TEXT,
        chapter_number TEXT,
        chapter_title TEXT,
        timestamp INTEGER
      );
    `);

    const now = Date.now();
    for (const mangaId of favorites) {
      if (mangaId == null) continue;
      await db.runAsync(
        'INSERT OR REPLACE INTO favorites (manga_id, added_at) VALUES (?, ?)',
        String(mangaId),
        now
      );
    }

    for (const h of history) {
      if (h?.chapterId == null) continue;
      const chapterNumber = h?.chapterNumber ?? h?.chapter_number ?? null;
      await db.runAsync(
        `INSERT OR REPLACE INTO history
          (chapter_id, manga_id, manga_title, manga_cover, chapter_number, chapter_title, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        String(h.chapterId),
        h?.mangaId != null ? String(h.mangaId) : null,
        h?.mangaTitle ?? null,
        h?.mangaCover ?? h?.cover ?? h?.thumbnail ?? null,
        chapterNumber != null ? String(chapterNumber) : null,
        h?.chapterTitle ?? h?.chapter_title ?? null,
        toTimestamp(h?.timestamp)
      );
    }
  } finally {
    await db.closeAsync();
  }

  const uri = new File(Paths.document, fileName).uri;
  return { uri, fileName, favorites: favorites.length, history: history.length };
}
