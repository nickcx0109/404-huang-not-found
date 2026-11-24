import { createEnemyBox } from './enemyBox.js';
import { PLAYER_BODY } from '../player/PlayerBody.js';

/**
 * Zombies online: one greybox per zombie in the interpolated snapshot, made with the same
 * createEnemyBox as the local run, so they look the same. Dead zombies and ones the server no
 * longer sends are removed.
 */
export class RemoteEnemyViews {
  constructor(scene, style, { size = PLAYER_BODY } = {}) {
    this.scene = scene;
    this.style = style;
    this.size = size;
    this.views = new Map();
  }

  /** @param {Array<{id, type, x, z, yaw, state}>} records  SnapshotBuffer.sample(...).enemies */
  update(records) {
    const seen = new Set();
    for (const record of records ?? []) {
      if (record.state === 'dead') continue;
      seen.add(record.id);
      let view = this.views.get(record.id);
      if (!view) {
        view = createEnemyBox(this.style, record.type, this.size);
        view.name = 'remote-' + view.name;
        this.scene.add(view);
        this.views.set(record.id, view);
      }
      view.position.set(record.x, this.size.height / 2, record.z);
      view.rotation.y = Number.isFinite(record.yaw) ? record.yaw : 0;
      view.visible = true;
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      this._remove(view);
      this.views.delete(id);
    }
  }

  _remove(view) {
    this.scene.remove(view);
    view.geometry.dispose();
    view.material.dispose();
  }

  dispose() {
    for (const view of this.views.values()) this._remove(view);
    this.views.clear();
  }
}
