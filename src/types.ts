export interface Team {
  id: string;
  seed: number | null;
  p1_name: string;
  p1_tag: string;
  p2_name: string | null;
  p2_tag: string | null;
}
export interface Tournament {
  id: number;
  name: string;
  best_of: number;
  started_at: string | null;
}
export const teamName = (t?: Team | null): string =>
  t ? [t.p1_name, t.p2_name].filter(Boolean).join(' - ') : '';
