export type Role = 'owner' | 'admin' | 'organizer' | 'moderator';
export interface Tournament {
  id: string;
  name: string;
  size: 8 | 16;
  status: 'draft' | 'live' | 'finished';
  sync_enabled: boolean;
  bo_overrides: Record<string, unknown>;
  start_at: string | null;
  finished_at: string | null;
  champion_id: string | null;
  runner_up_id: string | null;
  created_at: string;
}
export interface Participant {
  id: string;
  tournament_id: string;
  slot: number;
  display_name: string;
  player_tag: string;
  clan_name: string | null;
}
