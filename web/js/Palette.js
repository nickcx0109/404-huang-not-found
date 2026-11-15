// Palette: loads art/style/palette.json (shared blocks) plus, on demand, one file per chapter
// block from art/style/chapters/<name>.json, and resolves a block (+ optional preset) into a
// plain "style" object. All colour / fog / light / post numbers come from here.
(function (Game) {
  'use strict';

  const BASE_BLOCK = 'default';
  const BLOCK_NAME = /^[A-Za-z0-9_-]+$/;

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  /** Deep-merges `over` on top of `base` without mutating either. Arrays are replaced. */
  function merge(base, over) {
    if (!isPlainObject(base) || !isPlainObject(over)) {
      return over === undefined ? base : over;
    }
    const out = Object.assign({}, base);
    for (const key of Object.keys(over)) {
      out[key] = merge(base[key], over[key]);
    }
    return out;
  }

  class Palette {
    /**
     * @param {object} raw            parsed palette.json
     * @param {string} [chaptersUrl]  folder holding one <block>.json per chapter block
     */
    constructor(raw, chaptersUrl) {
      if (!isPlainObject(raw) || !isPlainObject(raw[BASE_BLOCK])) {
        throw new Error('palette.json must contain a "' + BASE_BLOCK + '" block');
      }
      this.raw = raw;
      this.chaptersUrl = chaptersUrl || null;
    }

    static async load(url, chaptersUrl) {
      return new Palette(await Palette._fetchJson(url, 'palette'), chaptersUrl);
    }

    static async _fetchJson(url, what) {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('Cannot load ' + what + ' ' + url + ' (HTTP ' + res.status + ')');
      try {
        return await res.json();
      } catch (err) {
        throw new Error(what + ' ' + url + ' is not valid JSON: ' + err.message);
      }
    }

    /**
     * Makes sure a block is loaded before resolve(): a block that palette.json does not hold
     * is read from <chaptersUrl><name>.json, and so is whatever it extends.
     */
    async ensure(blockName) {
      const pending = [blockName || BASE_BLOCK];
      const seen = new Set();
      while (pending.length > 0) {
        const name = pending.pop();
        if (seen.has(name)) continue;
        seen.add(name);
        if (!isPlainObject(this.raw[name])) {
          if (!this.chaptersUrl || !BLOCK_NAME.test(name) || name.startsWith('_')) {
            return; // resolve() reports the unknown name
          }
          const res = await fetch(this.chaptersUrl + name + '.json', { cache: 'no-store' });
          if (!res.ok) return;
          try {
            this.raw[name] = await res.json();
          } catch (err) {
            throw new Error('Palette block file ' + name + '.json is not valid JSON: ' + err.message);
          }
        }
        const parent = this.raw[name].extends;
        if (typeof parent === 'string') pending.push(parent.split('/')[0]);
      }
    }

    blockNames() {
      return Object.keys(this.raw).filter((k) => !k.startsWith('_'));
    }

    presetNames(blockName) {
      const block = this.raw[blockName];
      return block && isPlainObject(block.presets) ? Object.keys(block.presets) : [];
    }

    /**
     * Returns the style for a block: default <- block <- preset.
     * Unknown names fail loudly so a typo never silently falls back to another look.
     */
    resolve(blockName, presetName, _chain) {
      const name = blockName || BASE_BLOCK;
      if (name.startsWith('_') || !isPlainObject(this.raw[name])) {
        throw new Error(
          'Palette block "' + name + '" not found in palette.json or art/style/chapters/' + name +
            '.json. Shared blocks: ' + this.blockNames().join(', ')
        );
      }
      const block = this.raw[name];

      // "extends": "<block>" or "<block>/<preset>" — start from that look instead of "default".
      let base = this.raw[BASE_BLOCK];
      if (typeof block.extends === 'string') {
        const chain = (_chain || []).concat(name);
        const parts = block.extends.split('/');
        if (chain.includes(parts[0])) {
          throw new Error('Palette blocks extend each other in a loop: ' + chain.join(' -> ') + ' -> ' + parts[0]);
        }
        base = this.resolve(parts[0], parts[1], chain);
      }
      let style = merge(base, block);

      const presets = isPlainObject(block.presets) ? block.presets : null;
      const chosen = presetName || (presets ? block.defaultPreset : null);
      if (presets && !chosen) {
        throw new Error(
          'Palette block "' + name + '" has no default preset yet. Add &preset=<name> to the URL. ' +
            'Available: ' + this.presetNames(name).join(', ')
        );
      }
      if (chosen) {
        if (!presets || !isPlainObject(presets[chosen])) {
          throw new Error(
            'Palette preset "' + chosen + '" not found in block "' + name + '". Available: ' +
              (this.presetNames(name).join(', ') || '(none)')
          );
        }
        style = merge(style, presets[chosen]);
      }
      delete style.presets;
      delete style.defaultPreset;
      delete style.extends;
      style.blockName = name;
      style.presetName = chosen || null;
      return style;
    }

    /** Palette hex colours are sRGB; the renderer works in linear space. */
    static color(hex) {
      return new THREE.Color(hex).convertSRGBToLinear();
    }
  }

  Game.Palette = Palette;
})((window.Game = window.Game || {}));
