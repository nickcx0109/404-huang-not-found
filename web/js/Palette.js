// Palette: loads art/style/palette.json and resolves one block (+ optional preset)
// into a plain "style" object. All colour / fog / light / post numbers come from here.
(function (Game) {
  'use strict';

  const BASE_BLOCK = 'default';

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
    constructor(raw) {
      if (!isPlainObject(raw) || !isPlainObject(raw[BASE_BLOCK])) {
        throw new Error('palette.json must contain a "' + BASE_BLOCK + '" block');
      }
      this.raw = raw;
    }

    static async load(url) {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('Cannot load palette ' + url + ' (HTTP ' + res.status + ')');
      let raw;
      try {
        raw = await res.json();
      } catch (err) {
        throw new Error('Palette ' + url + ' is not valid JSON: ' + err.message);
      }
      return new Palette(raw);
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
    resolve(blockName, presetName) {
      const name = blockName || BASE_BLOCK;
      if (name.startsWith('_') || !isPlainObject(this.raw[name])) {
        throw new Error(
          'Palette block "' + name + '" not found. Available: ' + this.blockNames().join(', ')
        );
      }
      const block = this.raw[name];
      let style = merge(this.raw[BASE_BLOCK], block);

      const presets = isPlainObject(block.presets) ? block.presets : null;
      const chosen = presetName || (presets ? block.defaultPreset : null);
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
