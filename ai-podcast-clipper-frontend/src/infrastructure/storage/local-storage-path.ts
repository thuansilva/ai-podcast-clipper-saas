import path from "path";

export const LOCAL_STORAGE_UPLOAD_DIR = "/tmp/ai-podcast-clipper";

/**
 * Resolves `key` against the local storage upload dir and rejects anything
 * that would escape it (absolute paths, `..` segments), regardless of how
 * the key is spelled. Returns null when the key is unsafe.
 */
export function resolveLocalStoragePath(key: string): string | null {
  const base = path.resolve(LOCAL_STORAGE_UPLOAD_DIR) + path.sep;
  const resolved = path.resolve(LOCAL_STORAGE_UPLOAD_DIR, key);
  if (!resolved.startsWith(base)) {
    return null;
  }
  return resolved;
}
