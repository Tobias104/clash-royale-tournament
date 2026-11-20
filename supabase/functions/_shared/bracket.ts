// Lógica pura del bracket de doble eliminación. Sin imports: la usan el frontend y las Edge Functions.
// Slot: id de equipo | 'BYE' (pase libre) | null (todavía por definir)
export type Slot = string | null;
export const BYE = 'BYE';

export type Src = { seed: number } | { win: string } | { lose: string };
export interface MatchDef { id: string; label: string; a: Src; b: Src }
export interface Result {
  match_id: string;
  winner: string;
  score_a: number;
  score_b: number;
  source: 'api' | 'manual';
  decided_at: string;
}
export interface Resolved {
  def: MatchDef;
  a: Slot;
  b: Slot;
  winner: Slot;
  loser: Slot;
  result: Result | null;
  auto: boolean; // true si se resolvió solo por un pase libre
}

// El orden importa: cada partido solo depende de partidos anteriores de la lista.
export const MATCHES: MatchDef[] = [
  { id: 'A', label: 'Llave A', a: { seed: 1 }, b: { seed: 2 } },
  { id: 'B', label: 'Llave B', a: { seed: 3 }, b: { seed: 4 } },
  { id: 'C', label: 'Llave C', a: { seed: 5 }, b: { seed: 6 } },
  { id: 'D', label: 'Llave D', a: { seed: 7 }, b: { seed: 8 } },
  { id: 'SF1', label: 'Semifinal 1', a: { win: 'A' }, b: { win: 'B' } },
  { id: 'SF2', label: 'Semifinal 2', a: { win: 'C' }, b: { win: 'D' } },
  { id: 'F', label: 'Final', a: { win: 'SF1' }, b: { win: 'SF2' } },
  { id: 'LA', label: 'Perdedores A-D', a: { lose: 'A' }, b: { lose: 'D' } },
  { id: 'LB', label: 'Perdedores B-C', a: { lose: 'B' }, b: { lose: 'C' } },
  { id: 'LS1', label: 'Semi perdedores 1', a: { lose: 'SF1' }, b: { win: 'LA' } },
  { id: 'LS2', label: 'Semi perdedores 2', a: { lose: 'SF2' }, b: { win: 'LB' } },
  { id: 'LF', label: 'Final perdedores', a: { win: 'LS1' }, b: { win: 'LS2' } },
  { id: 'REP', label: 'Repechaje', a: { lose: 'F' }, b: { win: 'LF' } },
  { id: 'GF', label: 'Gran final', a: { win: 'F' }, b: { win: 'REP' } },
];

export const winsNeeded = (bestOf: number): number => Math.floor(bestOf / 2) + 1;
export const srcId = (s: Src): string | null => ('seed' in s ? null : 'win' in s ? s.win : s.lose);

/** seeds[i] = id del equipo con seed i+1 (o null = pase libre). results = resultados guardados por partido. */
export function resolve(seeds: (string | null)[], results: Record<string, Result>): Record<string, Resolved> {
  const out: Record<string, Resolved> = {};
  const pick = (s: Src): Slot => {
    if ('seed' in s) return seeds[s.seed - 1] ?? BYE;
    if ('win' in s) return out[s.win].winner;
    return out[s.lose].loser;
  };
  for (const def of MATCHES) {
    const a = pick(def.a);
    const b = pick(def.b);
    let winner: Slot = null;
    let loser: Slot = null;
    let auto = false;
    let result: Result | null = null;
    if (a === BYE && b === BYE) { winner = BYE; loser = BYE; auto = true; }
    else if (a === BYE) { winner = b; loser = BYE; auto = true; }
    else if (b === BYE) { winner = a; loser = BYE; auto = true; }
    else if (a && b) {
      const r = results[def.id];
      // Un resultado solo vale si el ganador guardado realmente juega este partido.
      if (r && (r.winner === a || r.winner === b)) {
        result = r;
        winner = r.winner;
        loser = r.winner === a ? b : a;
      }
    }
    out[def.id] = { def, a, b, winner, loser, result, auto };
  }
  return out;
}
