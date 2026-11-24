import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** web/levels/ next to this repository's server/ folder. */
export const SHIPPED_LEVELS_DIR = fileURLToPath(new URL('../../web/levels/', import.meta.url));

/** The level names a room may be created with (file names in web/levels/ without `.json`). */
export class LevelCatalog {
  constructor(names = []) {
    this.names = new Set(names);
  }

  /** Reads the catalog once from a directory of `<name>.json` files. */
  static fromDirectory(directory = SHIPPED_LEVELS_DIR) {
    const names = readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name.slice(0, -'.json'.length));
    return new LevelCatalog(names);
  }

  has(name) {
    return this.names.has(name);
  }
}
