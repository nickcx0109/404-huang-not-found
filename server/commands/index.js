import { CreateCommand, JoinCommand, LeaveCommand, StartCommand } from './RoomCommands.js';
import { PingCommand, InputCommand, ActionCommand } from './GameCommands.js';

/** Every command the room server understands. */
export function defaultCommands() {
  return [
    new CreateCommand(), new JoinCommand(), new LeaveCommand(), new StartCommand(),
    new PingCommand(), new InputCommand(), new ActionCommand(),
  ];
}
