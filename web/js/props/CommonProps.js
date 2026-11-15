// CommonProps: greybox stand-ins shared by several chapters (cars, trucks, street lamps,
// fences, plain walls). Chapter-specific ones live in Ch1Props.js / Ch2Props.js / Ch3Props.js.
//
// Contract for every stand-in: the builder gets { prop, size, factory } and returns an Object3D
// built around the origin — metres, +Y up, front toward -Z, origin at bottom centre.
// Colours come from the palette through the factory (factory.material('key') reads
// greybox.<key>); none are written here. A stand-in is used only until web/assets/models/
// holds a model of the same name that its manifest marks "ready".
//
// SHARED FILE: every chapter uses it. Talk to the team lead before changing it.
(function (Game) {
  'use strict';

  /** Simple box in a palette colour. */
  function block(colorKey) {
    return (ctx) => ctx.factory.box(ctx.size, colorKey);
  }

  /** Box part of a larger prop, placed by its bottom centre. */
  function part(factory, colorKey, w, h, d, x, y, z) {
    const mesh = factory.box({ w, h, d }, colorKey);
    mesh.position.set(x, y, z);
    return mesh;
  }

  class CommonProps {
    /** @param {Game.PropFactory} factory */
    static registerAll(factory) {
      factory
        .register('crate', block('crate'))
        .register('pillar', (ctx) => ctx.factory.cylinder(ctx.size, 'pillar'))
        .register('building', block('building'))
        .register('low_wall', block('lowWall'))
        .register('fence', block('fence'))
        .register('road', CommonProps.road)
        .register('car_wreck', CommonProps.carWreck)
        .register('car_parked', CommonProps.carBody)
        .register('truck_wreck', CommonProps.truckWreck)
        .register('van_wreck', CommonProps.vanWreck)
        .register('street_lamp', CommonProps.streetLamp);
    }

    /** Flat slab of road surface; give it a "size" in the level. */
    static road(ctx) {
      const slab = ctx.factory.box(ctx.size, 'road');
      slab.castShadow = false;
      return slab;
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
      const car = CommonProps.carBody(ctx);
      car.rotation.z = THREE.MathUtils.degToRad(2.5);
      return car;
    }


    /** Street lamp with the power out: pole and an arm reaching toward the front (-Z). */
    static streetLamp(ctx) {
      const { factory, size } = ctx;
      const metal = factory.material('metal');
      const lamp = new THREE.Group();
      lamp.add(factory.cylinder({ w: 0.16, h: size.h, d: 0.16 }, 'metal', 8));
      lamp.add(factory.part(metal, 0.1, 0.1, 1.5, 0, size.h - 0.1, -0.7));
      lamp.add(factory.part(metal, 0.32, 0.12, 0.6, 0, size.h - 0.2, -1.4));
      return lamp;
    }

    /** Box truck left across a street: cab at the front (-Z), cargo box behind it. */
    static truckWreck(ctx) {
      const { factory, size } = ctx;
      const { w, h, d } = size;
      const body = factory.material('truck');
      const tire = factory.material('tire');
      const truck = new THREE.Group();
      truck.add(factory.part(body, w, h * 0.74, d * 0.66, 0, h * 0.24, d * 0.17));
      truck.add(factory.part(body, w * 0.94, h * 0.6, d * 0.26, 0, h * 0.16, -d * 0.36));
      [-1, 1].forEach((side) => {
        [-0.36, 0.1, 0.38].forEach((along) => {
          truck.add(factory.part(tire, w * 0.16, h * 0.3, d * 0.13, side * w * 0.42, 0, along * d));
        });
      });
      truck.rotation.z = THREE.MathUtils.degToRad(1.5);
      return truck;
    }

    /** Van: one tall box with a lower nose at the front (-Z). */
    static vanWreck(ctx) {
      const { factory, size } = ctx;
      const { w, h, d } = size;
      const body = factory.material('truck');
      const tire = factory.material('tire');
      const van = new THREE.Group();
      van.add(factory.part(body, w, h * 0.8, d * 0.8, 0, h * 0.2, d * 0.1));
      van.add(factory.part(body, w * 0.96, h * 0.5, d * 0.22, 0, h * 0.18, -d * 0.39));
      [-1, 1].forEach((side) => {
        [-0.32, 0.32].forEach((along) => {
          van.add(factory.part(tire, w * 0.16, h * 0.32, d * 0.14, side * w * 0.42, 0, along * d));
        });
      });
      return van;
    }
  }

  Game.CommonProps = CommonProps;
  Game.PropFactory.registerSet('common', CommonProps.registerAll);
})((window.Game = window.Game || {}));
