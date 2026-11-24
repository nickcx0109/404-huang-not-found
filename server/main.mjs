// Online co-op room server (docs/tech/NETWORK.md). Run: node server/main.mjs
import { RoomServer } from './RoomServer.js';
import { WsTransport } from './transport/WsTransport.js';
import { LevelCatalog } from './rooms/LevelCatalog.js';

const STEP_SECONDS = 1 / 30;

const levels = LevelCatalog.fromDirectory();
const rooms = new RoomServer({ levels });
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
ticker = setInterval(() => rooms.tick(STEP_SECONDS), STEP_SECONDS * 1000);
