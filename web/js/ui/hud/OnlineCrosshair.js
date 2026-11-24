import { CrosshairWidget } from './CrosshairWidget.js';
import { NET_EVENTS } from '../../net/NetEventTranslator.js';

/**
 * The crosshair online. The ticks still jump at once on the locally played shot (which has no
 * `hit` yet); the hit cross waits for the server's answer, which NetEventTranslator republishes
 * as NET_EVENTS.SHOT_CONFIRMED so the shot is not played twice. Kills arrive as entity.died, as
 * in single player.
 */
export class OnlineCrosshair extends CrosshairWidget {
  bind(events, playerId) {
    super.bind(events, playerId);
    this.listen(events, NET_EVENTS.SHOT_CONFIRMED, detail => {
      if (detail.ownerId === playerId && detail.hit) this.mark.hit();
    });
  }
}
