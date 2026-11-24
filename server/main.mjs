// Online co-op game server (docs/tech/NETWORK.md). Run: npm start  (or node server/main.mjs)
//
// One port serves the game page (web/, art/), GET /health and the WebSocket, so a deploy has one
// https URL to share and the page reaches wss:// on its own origin.
//   PORT  port to listen on (default 8787)
//   HOST  address to bind (default 0.0.0.0, every interface; cloud hosts need that)
import { RoomServer } from './RoomServer.js';
import { WsTransport } from './transport/WsTransport.js';
import { LevelCatalog } from './rooms/LevelCatalog.js';
import { SessionRoomGame, STEP_SECONDS } from './game/SessionRoomGame.js';
import { createGameHttp } from './http/gameHttp.js';

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = '0.0.0.0';

const levels = LevelCatalog.fromDirectory();
const now = () => Date.now();
// Every room runs its own GameSession (docs/tech/NETWORK.md); the clock is the one `pong` reports.
const rooms = new RoomServer({ levels, now, createGame: () => new SessionRoomGame({ now }) });
console.log(`Levels: ${[...levels.names].join(', ')}`);

let ticker = null;
const http = createGameHttp();
// A listening server that errors is in an unknown state: log it and exit so the host restarts us.
const transport = new WsTransport(rooms, {
  onError: error => {
    console.error('Server error, shutting down:', error);
    shutdown(1);
  },
}).attach(http.server);

let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(ticker);
  await transport.close();
  await http.close();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const host = process.env.HOST || DEFAULT_HOST;
const port = await http.listen(Number(process.env.PORT) || DEFAULT_PORT, host);
const shownHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
console.log(`Game server on http://${shownHost}:${port}/ (WebSocket on the same port, health check /health)`);
// Rooms get the real time since the last tick, so a late timer does not slow the game down;
// SessionRoomGame turns it into fixed 1/30 s steps.
let lastTick = performance.now();
ticker = setInterval(() => {
  const tickAt = performance.now();
  rooms.tick((tickAt - lastTick) / 1000);
  lastTick = tickAt;
}, STEP_SECONDS * 1000);
