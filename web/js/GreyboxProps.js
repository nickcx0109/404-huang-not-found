// GreyboxProps: primitive stand-ins registered with PropFactory until real models exist.
// Each builder gets { prop, size, factory } and returns an Object3D built around the origin
// (metres, +Y up, front toward -Z, origin at bottom centre). Colours come from the palette
// through the factory; none are written here.
// This file holds the generic ones and chapter 1's; PlazaProps.js holds chapter 2's.
(function (Game) {
  'use strict';

  /** Deterministic 0..1 number from a prop's position: a level looks the same on every load. */
  function hash01(prop, salt) {
    const s = Math.sin(prop.x * 127.1 + prop.z * 311.7 + salt * 74.7) * 43758.5453;
    return s - Math.floor(s);
  }

  /** Box part of a larger prop, placed by its bottom centre. */
  function part(factory, colorKey, w, h, d, x, y, z) {
    const mesh = factory.box({ w, h, d }, colorKey);
    mesh.position.set(x, y, z);
    return mesh;
  }

  class GreyboxProps {
    /** @param {Game.PropFactory} factory */
    static registerAll(factory) {
      factory
        .register('crate', (ctx) => ctx.factory.box(ctx.size, 'crate'))
        .register('pillar', (ctx) => ctx.factory.cylinder(ctx.size, 'pillar'))
        .register('road', GreyboxProps.road)
        .register('tree', GreyboxProps.tree)
        .register('car_wreck', GreyboxProps.carWreck)
        .register('car_parked', GreyboxProps.carBody)
        .register('escape_car', GreyboxProps.escapeCar);
    }

    /** Flat slab of road surface; give it a "size" in the level. */
    static road(ctx) {
      const slab = ctx.factory.box(ctx.size, 'road');
      slab.castShadow = false;
      return slab;
    }

    /** Bare dead tree: a tapered trunk with a few leafless branches. */
    static tree(ctx) {
      const { factory, size, prop } = ctx;
      const tree = new THREE.Group();
      tree.add(factory.cylinder(size, 'tree', 6, 0.2));

      const trunkRadius = Math.min(size.w, size.d) / 2;
      const branches = 2 + Math.floor(hash01(prop, 1) * 3);
      for (let i = 0; i < branches; i++) {
        const length = size.h * (0.22 + 0.2 * hash01(prop, 10 + i));
        const geometry = new THREE.CylinderGeometry(0.02, trunkRadius * 0.28, length, 4);
        geometry.translate(0, length / 2, 0);
        const branch = new THREE.Mesh(geometry, factory.material('tree'));
        branch.castShadow = true;
        branch.receiveShadow = true;
        branch.position.y = size.h * (0.45 + 0.4 * hash01(prop, 20 + i));
        branch.rotation.order = 'YXZ';
        branch.rotation.y = hash01(prop, 30 + i) * Math.PI * 2;
        branch.rotation.z = THREE.MathUtils.degToRad(30 + 35 * hash01(prop, 40 + i));
        tree.add(branch);
      }
      return tree;
    }

    /** Car silhouette: body, cabin and four wheels. Front toward -Z. */
    static carBody(ctx) {
      const { factory, size } = ctx;
      const { w, h, d } = size;
      const car = new THREE.Group();
      car.add(part(factory, 'car', w, h * 0.42, d, 0, h * 0.2, 0));
      car.add(part(factory, 'car', w * 0.86, h * 0.38, d * 0.5, 0, h * 0.62, d * 0.07));
      [-1, 1].forEach((side) => {
        [-1, 1].forEach((end) => {
          car.add(part(factory, 'tire', w * 0.14, h * 0.44, d * 0.16, side * w * 0.44, 0, end * d * 0.3));
        });
      });
      return car;
    }

    /** Abandoned car, sagging on one side. */
    static carWreck(ctx) {
      const car = GreyboxProps.carBody(ctx);
      car.rotation.z = THREE.MathUtils.degToRad(2.5);
      return car;
    }

    /**
     * The car the players are looking for: its tail lights glow in the accent colour and
     * throw a little of it onto the road. The lights face +Z (the rear).
     */
    static escapeCar(ctx) {
      const { factory, size } = ctx;
      const { w, h, d } = size;
      const car = GreyboxProps.carBody(ctx);
      [-1, 1].forEach((side) => {
        const geometry = new THREE.BoxGeometry(w * 0.28, h * 0.11, 0.05);
        const lamp = new THREE.Mesh(geometry, factory.emitters.accentMaterial());
        lamp.position.set(side * w * 0.33, h * 0.5, d / 2 + 0.02);
        car.add(lamp);
      });
      const glow = factory.emitters.accentLight();
      if (glow) {
        glow.position.set(0, h * 0.5, d / 2 + 0.7);
        car.add(glow);
      }
      return car;
    }
  }

  Game.GreyboxProps = GreyboxProps;
})((window.Game = window.Game || {}));
