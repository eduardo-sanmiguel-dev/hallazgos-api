import { realpathSync, statSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';

/** Archivo regular dentro de root, incluso después de resolver symlinks. */
export const safeFilePath = (root: string, name: string): string | null => {
  if (
    typeof name !== 'string' ||
    !name ||
    name.includes('\0') ||
    isAbsolute(name) ||
    name.split(/[\\/]/).some((part) => !part || part === '.' || part === '..')
  )
    return null;
  try {
    const realRoot = realpathSync(root);
    const file = realpathSync(resolve(realRoot, name));
    const remainder = relative(realRoot, file);
    if (
      !remainder ||
      remainder.startsWith('..') ||
      isAbsolute(remainder) ||
      !statSync(file).isFile()
    )
      return null;
    return file;
  } catch {
    return null;
  }
};
