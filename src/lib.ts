import { BYE, MATCHES } from '../supabase/functions/_shared/bracket.ts';
import type { Slot, Src } from '../supabase/functions/_shared/bracket.ts';
import { teamName } from './types';
import type { Team } from './types';

export * from '../supabase/functions/_shared/bracket.ts';

export const LABEL: Record<string, string> = Object.fromEntries(MATCHES.map((m) => [m.id, m.label]));

export function slotText(slot: Slot, src: Src, teams: Map<string, Team>): { text: string; ph: boolean } {
  if (slot === BYE) return { text: 'Libre (bye)', ph: true };
  if (slot) return { text: teamName(teams.get(slot)) || 'Jugador', ph: false };
  if ('seed' in src) return { text: `Jugador ${src.seed}`, ph: true };
  if ('win' in src) return { text: `Ganador ${LABEL[src.win]}`, ph: true };
  return { text: `Perdedor ${LABEL[src.lose]}`, ph: true };
}
