// Online co-op room server (docs/tech/NETWORK.md). Run: node server/main.mjs
import { RoomServer } from './RoomServer.js';
import { WsTransport } from './transport/WsTransport.js';
import { LevelCatalog } from './rooms/LevelCatalog.js';

const STEP_SECONDS = 1 / 30;

const levels = LevelCatalog.fromDirectory();
const rooms = new RoomServer({ levels });
console.log(`Levels: ${[...levels.names].join(', ')}`);
const transport = new WsTransport(rooms);
const port = await transport.listen(Number(process.env.PORT) || 8787);
console.log(`Room server listening on ws://localhost:${port}`);

const ticker = setInterval(() => rooms.tick(STEP_SECONDS), STEP_SECONDS * 1000);

async function shutdown() {
  clearInterval(ticker);
  await transport.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
