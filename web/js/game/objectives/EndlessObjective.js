import { Objective } from './Objective.js';

/** No way to win: waves keep coming until everyone is down. Used by levels without an objective. */
export class EndlessObjective extends Objective {}
