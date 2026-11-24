#!/usr/bin/env node
// Measures the round trip to a game server with the protocol's own ping/pong
// (docs/tech/NETWORK.md).
//
//   node tools/net-latency.mjs ws://localhost:8787 [count]
//   node tools/net-latency.mjs wss://<app>.fly.dev 50
//
// Sends `count` pings (default 20) one after another and prints min, median, p95 and max RTT,
// plus the server clock offset estimated from the fastest round trip.

import { WebSocket } from 'ws';
import { LatencyStats } from './net/LatencyStats.js';

const PING_TIMEOUT_MS = 5000;
const GAP_MS = 50; // between pings, so they do not queue behind each other

const [url, countText = '20'] = process.argv.slice(2);
const count = Number.parseInt(countText, 10);
if (!url || !/^wss?:\/\//.test(url) || !(count > 0)) {
  console.error('Usage: node tools/net-latency.mjs <ws-url> [count]');
  console.error('  e.g. node tools/net-latency.mjs ws://localhost:8787 20');
  process.exit(2);
}

const socket = new WebSocket(url);
let waiting = null; // resolve of the ping in flight

socket.on('message', (data) => {
  let message;
  try {
    message = JSON.parse(data.toString('utf8'));
  } catch {
    return;
  }
  if (message.t === 'pong' && waiting) waiting(message);
});

function ping(c) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting = null;
      reject(new Error(`no pong within ${PING_TIMEOUT_MS} ms`));
    }, PING_TIMEOUT_MS);
    waiting = (message) => {
      if (message.c !== c) return; // a late pong of an earlier ping
      clearTimeout(timer);
      waiting = null;
      resolve(message);
    };
    socket.send(JSON.stringify({ t: 'ping', c }));
  });
}

const format = (ms) => (ms === null ? '-' : `${ms.toFixed(1)} ms`);

try {
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const stats = new LatencyStats();
  for (let i = 0; i < count; i++) {
    const c = Date.now();
    const sentAt = performance.now();
    const pong = await ping(c);
    stats.add(performance.now() - sentAt, pong.s, Date.now());
    if (GAP_MS && i < count - 1) await new Promise((resolve) => setTimeout(resolve, GAP_MS));
  }
  const { min, median, p95, max, offset } = stats.summary();
  console.log(`${url}  ${stats.count} pings`);
  console.log(`RTT  min ${format(min)}  median ${format(median)}  p95 ${format(p95)}  max ${format(max)}`);
  console.log(`clock offset (server - this machine) ${format(offset)}`);
  socket.close();
} catch (error) {
  console.error(`Failed: ${error.message}`);
  socket.terminate();
  process.exitCode = 1;
}
