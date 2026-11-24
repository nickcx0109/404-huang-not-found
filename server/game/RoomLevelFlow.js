import { LevelFlow } from '../../web/js/level/LevelFlow.js';

/** One authoritative interaction per seat; room-owned cleared keys survive level visits. */
export class RoomLevelFlow {
  constructor(session, controllers, store, navigate, now) {
    this.session = session;
    this.controllers = controllers;
    this.store = store;
    this.now = now;
    this.notify = () => {};
    this.heldUntil = new Map();
    this.status = new Map();
    const ctx = session.context;
    this.flows = new Map([...controllers].map(([id, controller]) => [id, new LevelFlow({
      level: ctx.level, collision: ctx.collision, player: controller, store,
      requireInteract: true, navigate,
    })]));
    // Each flow has its own block index, but every seat uses the same collision world.
    for (const flow of this.flows.values()) flow.onCleared = box => {
      if (this.clearing) return;
      this.clearing = true;
      for (const other of this.flows.values()) other.clear(box.id.slice(LevelFlow.BLOCK_PREFIX.length));
      this.clearing = false;
      ctx.pathFinder.invalidate();
      this.notify({ t: 'event', name: 'level.block-cleared', detail: { level: ctx.level.name, exitId: box.id.slice(LevelFlow.BLOCK_PREFIX.length) } });
    };
  }

  hold(id, holding) {
    this.heldUntil.set(id, holding ? this.now() + 350 : 0);
    if (!holding) this.flows.get(id)?.cancelInteraction();
  }

  update(dt, room) {
    for (const [id, flow] of this.flows) {
      const player = this.session.playerById(id);
      const blocked = !this.session.canMove || !player?.damageable.alive
        || this.session.isRooted(id) || room.isAway?.(id) || this.session.revives.targetFor(player);
      if (blocked) {
        flow.cancelInteraction();
        this.status.set(id, null);
        continue;
      }
      let status = flow.update(dt, (this.heldUntil.get(id) ?? 0) > this.now());
      if (!status && flow.exits.some(exit => !flow.isBlocked(exit.marker.id)
        && Math.hypot(flow.player.x - exit.marker.x, flow.player.z - exit.marker.z) <= exit.marker.r)) {
        status = { kind: 'exit', progress: 0 };
      }
      this.status.set(id, status);
    }
  }

  arriveFrom(from) {
    for (const flow of this.flows.values()) {
      const exit = flow.exits.find(e => e.target === from);
      if (!exit) continue;
      const controller = flow.player;
      controller.x = exit.marker.x;
      controller.z = exit.marker.z;
      controller.yaw = (exit.marker.yaw ?? 0) * Math.PI / 180;
      flow.cancelDeparture();
    }
  }
}
