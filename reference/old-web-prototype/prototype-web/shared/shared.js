'use strict';
const $ = s => document.querySelector(s);
const V3 = THREE.Vector3;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const pickOne = a => a[(Math.random() * a.length) | 0];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const SENS = { min: 0.2, max: 3, def: 1, base: 0.0022 };
const settings = {
  sens: clamp(+store.get('zwp.sens', SENS.def) || SENS.def, SENS.min, SENS.max),
  setSens(v) { this.sens = clamp(+v || SENS.def, SENS.min, SENS.max); store.set('zwp.sens', this.sens); }
};

/* =========================================================
   Shared：EventBus（Observer）與 ObjectPool
   ========================================================= */
class EventBus {
  constructor() { this.map = new Map(); this.any = []; }
  on(type, fn) { if (!this.map.has(type)) this.map.set(type, new Set()); this.map.get(type).add(fn); return () => this.off(type, fn); }
  off(type, fn) { const s = this.map.get(type); if (s) s.delete(fn); }
  onAny(fn) { this.any.push(fn); }
  emit(type, payload = {}) { const s = this.map.get(type); if (s) [...s].forEach(fn => fn(payload)); this.any.forEach(fn => fn(type, payload)); }
}
const bus = new EventBus();

class ObjectPool {
  constructor(create, onGet, onRelease) { this.free = []; this.create = create; this.onGet = onGet; this.onRelease = onRelease; }
  get() { const o = this.free.pop() || this.create(); if (this.onGet) this.onGet(o); return o; }
  release(o) { if (this.onRelease) this.onRelease(o); this.free.push(o); }
}

