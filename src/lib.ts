import { BYE } from '../supabase/functions/_shared/engine.ts';
import type { MatchDef, Slot, Src } from '../supabase/functions/_shared/engine.ts';

export * from '../supabase/functions/_shared/engine.ts';

/** Texto de un lugar del bracket: jugador, pase libre o "Ganador/Perdedor de ...". */
export function slotText(slot: Slot, src: Src, names: Map<string, string>, defs: MatchDef[]): string {
  if (slot === BYE) return 'Libre (bye)';
  if (slot) return names.get(slot) ?? 'Jugador';
  const label = (id: string) => defs.find((d) => d.id === id)?.label ?? id;
  if ('slot' in src) return `Jugador ${src.slot + 1}`;
  if ('win' in src) return `Ganador ${label(src.win)}`;
  if ('lose' in src) return `Perdedor ${label(src.lose)}`;
  return 'Por definir';
}
