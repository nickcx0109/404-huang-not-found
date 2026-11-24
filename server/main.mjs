// Online co-op room server (docs/tech/NETWORK.md). Run: node server/main.mjs
import { RoomServer } from './RoomServer.js';
import { WsTransport } from './transport/WsTransport.js';
import { LevelCatalog } from './rooms/LevelCatalog.js';
import { SessionRoomGame, STEP_SECONDS } from './game/SessionRoomGame.js';

const levels = LevelCatalog.fromDirectory();
const now = () => Date.now();
// Every room runs its own GameSession (docs/tech/NETWORK.md); the clock is the one `pong` reports.
const rooms = new RoomServer({ levels, now, createGame: () => new SessionRoomGame({ now }) });
console.log(`Levels: ${[...levels.names].join(', ')}`);

let ticker = null;
// A listening server that errors is in an unknown state: log it and exit so the host restarts us.
const transport = new WsTransport(rooms, {
  onError: error => {
    console.error('WebSocket server error, shutting down:', error);
    shutdown(1);
  },
});

async function shutdown(code = 0) {
  clearInterval(ticker);
  await transport.close();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const port = await transport.listen(Number(process.env.PORT) || 8787);
console.log(`Room server listening on ws://localhost:${port}`);
// Rooms get the real time since the last tick, so a late timer does not slow the game down;
// SessionRoomGame turns it into fixed 1/30 s steps.
let lastTick = performance.now();
ticker = setInterval(() => {
  const tickAt = performance.now();
  rooms.tick((tickAt - lastTick) / 1000);
  lastTick = tickAt;
}, STEP_SECONDS * 1000);
