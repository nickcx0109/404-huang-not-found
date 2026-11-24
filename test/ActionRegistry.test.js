import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../web/js/core/EventBus.js';
import { EVENTS } from '../web/js/game/events.js';
import { PLAYER_BODY } from '../web/js/player/PlayerBody.js';
import { ActionRegistry } from '../server/game/actions/ActionRegistry.js';
import { ActionHandler, RequestAction } from '../server/game/actions/ActionHandlers.js';
import { RemoteController } from '../server/game/RemoteController.js';
import { ACTION_KINDS } from '../web/js/net/protocol.js';

function seat(message) {
  const events = new EventBus();
  const emitted = [];
  for (const name of Object.values(EVENTS)) events.on(name, detail => emitted.push([name, detail]));
  const player = { id: 'p2', position: { x: 0, y: 0, z: 0 } };
  const held = [];
  const rewound = [];
  const aim = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } };
  const session = {
    context: { events, aim, enemies: ['zombie'] },
    revives: { hold: (id, holding) => held.push([id, holding]) },
    playerById: id => (id === player.id ? player : undefined),
  };
  const controller = new RemoteController({ x: 4, z: -2, yaw: Math.PI });
  const rewind = {
    run(enemies, at, now, judge) {
      rewound.push({ enemies, at, now });
      return judge();
    },
  };
  return { emitted, held, rewound, aim, player,
    seat: { session, playerId: 'p2', controller, message: { t: 'action', seq: 3, at: 900, ...message }, now: 1000, rewind } };
}

test('the standard registry has a handler for every action kind the protocol allows', () => {
  const registry = ActionRegistry.standard();
  for (const kind of ACTION_KINDS) assert.ok(registry.has(kind), kind);
  assert.equal(registry.dispatch({ message: { kind: 'dance' } }), false);
  assert.throws(() => registry.register({ kind: 'x', handle() {} }), TypeError);
  assert.throws(() => registry.register(new RequestAction('fire', EVENTS.FIRE_REQUESTED)), /Duplicate/);
  assert.throws(() => new ActionHandler('x'), TypeError);
});

test('fire aims from the player\'s eyes, then requests the shot inside a rewind', () => {
  const { emitted, rewound, aim, seat: s } = seat({ kind: 'fire' });
  ActionRegistry.standard().dispatch(s);
  assert.deepEqual(emitted, [[EVENTS.FIRE_REQUESTED, { ownerId: 'p2' }]]);
  assert.equal(rewound.length, 1);
  assert.deepEqual([rewound[0].at, rewound[0].now, rewound[0].enemies], [900, 1000, ['zombie']]);
  assert.deepEqual(aim.origin, { x: 4, y: PLAYER_BODY.eyeHeight, z: -2 });
  assert.ok(Math.abs(aim.direction.z - 1) < 1e-9, 'yaw π looks toward +Z');
});

test('each other kind becomes its session command with the owner id', () => {
  const cases = [
    [{ kind: 'reload' }, [EVENTS.RELOAD_REQUESTED, { ownerId: 'p2' }]],
    [{ kind: 'secondary' }, [EVENTS.SECONDARY_REQUESTED, { ownerId: 'p2' }]],
    [{ kind: 'switch', index: 2 }, [EVENTS.SWITCH_REQUESTED, { ownerId: 'p2', index: 2 }]],
    [{ kind: 'cycle', step: -1 }, [EVENTS.CYCLE_REQUESTED, { ownerId: 'p2', step: -1 }]],
    [{ kind: 'pickup' }, [EVENTS.PICKUP_REQUESTED, { ownerId: 'p2' }]],
  ];
  for (const [message, expected] of cases) {
    const { emitted, rewound, seat: s } = seat(message);
    ActionRegistry.standard().dispatch(s);
    assert.deepEqual(emitted, [expected], message.kind);
    assert.equal(rewound.length, 0, `${message.kind} is not rewound`);
  }
});

test('pickup and secondary see the latest accepted position; revive holds or releases', () => {
  const { player, seat: s } = seat({ kind: 'pickup' });
  ActionRegistry.standard().dispatch(s);
  assert.deepEqual(player.position, { x: 4, y: 0, z: -2 });

  const revive = seat({ kind: 'revive', holding: true });
  ActionRegistry.standard().dispatch(revive.seat);
  revive.seat.message = { t: 'action', kind: 'revive', seq: 4, at: 0, holding: false };
  ActionRegistry.standard().dispatch(revive.seat);
  assert.deepEqual(revive.held, [['p2', true], ['p2', false]]);
  assert.deepEqual(revive.emitted, []);
});
