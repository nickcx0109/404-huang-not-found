import { HttpApp } from './HttpApp.js';
import { HealthRoute, RedirectRoute, StaticRoute } from './routes.js';
import { ServerTaggedPage } from './ServerTaggedPage.js';
import { REPO_ROOT, StaticFiles } from './StaticFiles.js';

/** Where `GET /` sends players. */
export const GAME_START_PAGE = '/web/index.html?play=1';

/**
 * The game server's HTTP side: /health, `/` → the game, the tagged game page and the read-only
 * web/ and art/ folders (the same paths tools/serve.mjs serves, because the page loads ../art/).
 * @param {{ root?: string, log?: ((line: string) => void) | null }} [options]
 */
export function createGameHttp({ root = REPO_ROOT, log = null } = {}) {
  // `no-cache`: browsers revalidate, so a redeploy is picked up on the next load.
  const files = new StaticFiles({ root, folders: ['web', 'art'], cacheControl: 'no-cache' });
  return new HttpApp([
    new HealthRoute(),
    new RedirectRoute('/', GAME_START_PAGE),
    new ServerTaggedPage({ files }),
    new StaticRoute(files),
  ], { log });
}
