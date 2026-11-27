/** Splits static batches into XZ cells so each batch can be culled on its own (B7). */
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

  /**
   * The grid for a level: long levels are chunked; small or indoor ones stay one batch per
   * material, where extra draw calls cost more than culling saves (ch2 +22 %, ch3 +71 % measured).
   * @param {{w:number, d:number}|null|undefined} bounds  the level's playable area in metres
   */
  static forBounds(bounds, { cellSize = 20, minSpan = 100 } = {}) {
    const span = Math.max(bounds?.w ?? 0, bounds?.d ?? 0);
    return span > minSpan ? new StaticChunkGrid(cellSize) : new WholeLevelGrid();
  }
}

/** One cell for everything: the original whole-level batching. */
export class WholeLevelGrid {
  keyForCenter() {
    return 'all';
  }
}
