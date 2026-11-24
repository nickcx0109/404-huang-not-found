import { NetClient } from '../net/NetClient.js';
import { TeamConnector } from '../net/TeamConnector.js';
import { TeamCode } from '../net/TeamCode.js';
import { PlayerName } from '../net/PlayerName.js';
import { teamErrorText } from '../net/teamErrors.js';
import { OnlineLobbyScreen } from '../ui/hud/OnlineLobbyScreen.js';
import { OnlineMode } from './OnlineMode.js';

/**
 * Loaded only when a server is configured (`?server=` or DEFAULT_SERVER_URL). It gives the
 * single-player start screen its team buttons and, once the server confirms a team, switches
 * the page from LocalMode to OnlineMode; leaving the team switches back.
 *
 * A link with `&join=CODE` joins that team on load. When the team plays another level than the
 * page shows, the page reloads on that level and joins again.
 */
export class OnlineHost {
  /** @param {App} app  @param {ModeSwitch} modes */
  constructor(app, modes) {
    this.app = app;
    this.modes = modes;
    this.url = app.options.server;
    this.names = new PlayerName(OnlineHost.storage());
    this.lobby = null;
    this.busy = false;
    this._return = () => {};
    this._notice = null;
  }

  /** localStorage, or null where the browser refuses it (private windows, blocked site data). */
  static storage() {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }

  /** Options for createGameplayRun: the start screen with the team buttons. */
  localRunOptions() {
    return {
      lobbyScreen: doc => {
        const lobby = new OnlineLobbyScreen(doc, { names: this.names });
        lobby.onTeam({ create: name => this.create(name), join: (name, code) => this.join(name, code) });
        if (this._notice) lobby.setStatus(teamErrorText(this._notice), { error: true });
        this._notice = null;
        this.lobby = lobby;
        return lobby;
      },
    };
  }

  /** @param {() => void} playAlone  puts the single-player run back (installGameplay) */
  onReturn(playAlone) {
    this._return = playAlone;
  }

  autoJoin() {
    const code = TeamCode.normalize(new URLSearchParams(globalThis.location?.search ?? '').get('join'));
    if (TeamCode.isValid(code)) this.join(this.names.use(this.names.load()), code);
  }

  create(name) {
    return this._connect(team => team.create(name, this.app.options.level), '建立隊伍中…');
  }

  join(name, code) {
    return this._connect(team => team.join(name, code), '加入隊伍 ' + code + ' 中…');
  }

  async _connect(request, text) {
    if (this.busy) return false;
    this.busy = true;
    this.lobby?.setStatus(text, { busy: true });
    const client = new NetClient({ url: this.url });
    try {
      const room = await request(new TeamConnector(client));
      if (room.level && room.level !== this.app.options.level) {
        this._reloadOn(room);
        client.leave();
        return false;
      }
      this.busy = false;
      this.modes.use(() => new OnlineMode(this.app, { client, room, onLeave: notice => this._leave(notice) }));
      return true;
    } catch (error) {
      client.disconnect();
      this.busy = false;
      const code = error?.code ?? 'connection-failed';
      if (!error?.code) console.warn('[net] ' + (error?.message ?? error));
      this.lobby?.setStatus(teamErrorText(code), { error: true });
      return false;
    }
  }

  _leave(notice) {
    this._notice = notice;
    this._return();
  }

  /** The team plays another level: open it and join the same team there. */
  _reloadOn(room) {
    const params = new URLSearchParams(globalThis.location.search);
    params.set('level', room.level);
    params.set('join', room.code);
    globalThis.location.search = params.toString();
  }
}
