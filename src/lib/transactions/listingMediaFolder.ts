/**
 * A listing media folder may be a Google Drive, Dropbox, OneDrive, or other
 * staff-shared HTTPS location. Keep it URL-only before displaying it as a
 * clickable link in the transaction editor.
 */
export function normalizeListingMediaFolderUrl(value: unknown): string | null {
  const candidate = String(value ?? '').trim();
  if (!candidate) return null;

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
