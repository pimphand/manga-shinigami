import { openDatabaseAsync } from 'expo-sqlite';
import { Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';

const TEMP_NAME = 'pustaka-import.db';

/**
 * Read favorites + reading history from an exported Pustaka .db file.
 * @param {string} pickedUri file:// URI of the picked .db (e.g. from document picker)
 * @returns {{ favorites: string[], history: object[] }}
 * @throws when the file is not a valid Pustaka database.
 */
export async function importLibraryFromSqlite(pickedUri) {
  if (!pickedUri) throw new Error('File tidak valid.');

  const dest = `${Paths.document.uri}${TEMP_NAME}`;
  await FileSystem.copyAsync({ from: pickedUri, to: dest });

  const db = await openDatabaseAsync(TEMP_NAME, undefined, Paths.document.uri);
  try {
    let favRows = [];
    let histRows = [];
    try {
      favRows = await db.getAllAsync('SELECT manga_id FROM favorites');
    } catch {
      favRows = null;
    }
    try {
      histRows = await db.getAllAsync(
        'SELECT chapter_id, manga_id, manga_title, manga_cover, chapter_number, chapter_title, timestamp FROM history'
      );
    } catch {
      histRows = null;
    }

    if (favRows == null && histRows == null) {
      throw new Error('File bukan database pustaka yang valid.');
    }

    return {
      favorites: (favRows ?? [])
        .map((r) => r?.manga_id)
        .filter((id) => id != null)
        .map((id) => String(id)),
      history: (histRows ?? [])
        .filter((r) => r?.chapter_id != null)
        .map((r) => ({
          mangaId: r?.manga_id != null ? String(r.manga_id) : undefined,
          mangaTitle: r?.manga_title ?? undefined,
          mangaCover: r?.manga_cover ?? undefined,
          chapterId: String(r.chapter_id),
          chapterNumber: r?.chapter_number ?? undefined,
          chapterTitle: r?.chapter_title ?? undefined,
          timestamp: r?.timestamp ?? undefined,
        })),
    };
  } finally {
    await db.closeAsync();
    await FileSystem.deleteAsync(dest, { idempotent: true });
  }
}
