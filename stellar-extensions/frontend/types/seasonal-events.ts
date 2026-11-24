/**
 * Shared types for the seasonal events API consumed by `useSeasonalEvents`.
 *
 * The backend reward service is the source of truth for these shapes:
 * - `seasonal-schedule.service.ts` provides the event window/status
 * - `prize-pool.service.ts` provides the reward pool amounts
 */

export type SeasonalEventStatus = 'ACTIVE' | 'UPCOMING' | 'ENDED';

export interface SeasonalRewardPool {
  /** Total amount funded into the event's prize pool. */
  totalAmount: number;
  /** Amount already paid out to participants. */
  distributedAmount?: number;
  /** Amount still available for distribution. */
  remainingAmount?: number;
  /** Asset code, e.g. "XLM" or "USDC". */
  currency: string;
}

export interface SeasonalEventParticipation {
  isParticipating: boolean;
  /** ISO timestamp of when the user joined, or null if they have not. */
  joinedAt: string | null;
  /** Event score used for leaderboard ordering. */
  score: number | null;
  completedPuzzles: number;
  /** 1-based leaderboard position, or null when unranked / not participating. */
  rank: number | null;
}

export interface SeasonalEvent {
  id: string;
  name: string;
  description: string;
  /** ISO timestamp for the start of the event. */
  startsAt: string;
  /** ISO timestamp for the end of the event. */
  endsAt: string;
  status: SeasonalEventStatus;
  rewardPool: SeasonalRewardPool;
  /** Null for anonymous requests or users who have not joined the event. */
  participation: SeasonalEventParticipation | null;
}

/** Accepted response envelopes from `GET /api/seasonal-events`. */
export type SeasonalEventsPayload =
  | SeasonalEvent[]
  | { events: SeasonalEvent[] }
  | { data: SeasonalEvent[] };
