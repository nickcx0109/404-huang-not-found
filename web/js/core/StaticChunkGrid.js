export class StaticChunkGrid {
  constructor(cellSize = 20) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new RangeError('Static batch cell size must be finite and positive');
    }
    this.cellSize = cellSize;
  }

  /** Returns the XZ cell key for a world-space bounds center. */
  keyForCenter({ x, z }) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
  }
}
