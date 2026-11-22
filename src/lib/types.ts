import type { LeaderRow, MatchRow, Picks, Settings, Team } from "./bracket";

export interface PublicState {
  settings: Settings;
  teams: Team[];
  matches: MatchRow[];
  participantCount: number;
  /** 마감(closed) 이후에만 제공 */
  leaderboard: LeaderRow[] | null;
  /** 공개(revealed) 이후에만 제공: matchKey → teamId → 인원 */
  pickStats: Record<string, Record<string, number>> | null;
}

export interface Me {
  id: string;
  dept: string;
  name: string;
  picks: Picks;
  updatedAt: string;
}

export interface OtherPicks {
  id: string;
  dept: string;
  name: string;
  picks: Picks;
}

export interface AdminParticipant extends LeaderRow {
  createdAt: string;
  updatedAt: string;
}
