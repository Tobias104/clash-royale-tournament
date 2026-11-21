// Motor del torneo de doble eliminación para 8 o 16 jugadores (con byes si hay menos).
// Código puro, sin dependencias: lo usan el sitio y las funciones del servidor.
export const BYE = 'BYE';
export type Slot = string | null; // id de jugador | 'BYE' | null (todavía por definir)
export type Side = 'a' | 'b';
export type Size = 8 | 16;
export type BestOf = 3 | 5;
export type Src = { slot: number } | { win: string } | { lose: string } | { same: string; side: Side };

export interface MatchDef {
  id: string;
  bracket: 'W' | 'L' | 'GF';
  round: number;
  index: number;
  label: string;
  a: Src;
  b: Src;
  bestOf: BestOf; // valor por defecto; se puede reemplazar desde la administración
}
export interface Result { match_id: string; winner: string; score_a: number; score_b: number }
export interface Resolved {
  def: MatchDef;
  a: Slot;
  b: Slot;
  winner: Slot;
  loser: Slot;
  result: Result | null;
  auto: boolean; // se resolvió solo por un pase libre (no cuenta como victoria)
  skipped: boolean; // solo el Reset: no hace falta jugarlo
}

export const winsNeeded = (bestOf: number): number => Math.floor(bestOf / 2) + 1;
export const isReal = (v: Slot): v is string => !!v && v !== BYE;

const WNAME: Record<number, string> = { 2: 'Semifinal', 4: 'Cuartos de final', 8: 'Octavos de final' };

/** Genera todos los partidos. Los jugadores ocupan los "slots" 0..size-1; el partido W1.i enfrenta los slots 2i y 2i+1. */
export function buildBracket(size: Size): MatchDef[] {
  const k = Math.log2(size);
  const lbRounds = 2 * (k - 1);
  const defs: MatchDef[] = [];

  // Bracket principal
  const W: string[][] = [];
  for (let r = 1; r <= k; r++) {
    const n = size >> r;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = `W${r}.${i + 1}`;
      ids.push(id);
      const a: Src = r === 1 ? { slot: 2 * i } : { win: W[r - 2][2 * i] };
      const b: Src = r === 1 ? { slot: 2 * i + 1 } : { win: W[r - 2][2 * i + 1] };
      const label = r === 1 ? `Llave ${String.fromCharCode(65 + i)}` : n === 1 ? 'Final bracket principal' : `${WNAME[n] ?? `Ronda ${r}`} ${i + 1}`;
      defs.push({ id, bracket: 'W', round: r, index: i, label, a, b, bestOf: r <= k - 2 ? 3 : 5 });
    }
    W.push(ids);
  }

  // Bracket de perdedores
  let lr = 0;
  const addL = (n: number, mk: (i: number) => [Src, Src]): string[] => {
    lr++;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const [a, b] = mk(i);
      const id = `L${lr}.${i + 1}`;
      ids.push(id);
      const label =
        lr === lbRounds ? 'Repechaje'
        : lr === lbRounds - 1 ? 'Final bracket de perdedores'
        : n === 1 ? `Perdedores ronda ${lr}` : `Perdedores ronda ${lr} · ${i + 1}`;
      defs.push({ id, bracket: 'L', round: lr, index: i, label, a, b, bestOf: lr <= lbRounds - 2 ? 3 : 5 });
    }
    return ids;
  };
  const w1 = W[0];
  // Los perdedores de la primera ronda se cruzan (A-D, B-C...), como en el PDF.
  let surv = addL(w1.length / 2, (i) => [{ lose: w1[i] }, { lose: w1[w1.length - 1 - i] }]);
  for (let j = 1; j <= k - 1; j++) {
    const drops = W[j]; // perdedores de la ronda j+1 del bracket principal
    const s = surv;
    surv = addL(s.length, (i) => [{ lose: drops[j % 2 === 1 ? i : s.length - 1 - i] }, { win: s[i] }]);
    if (j < k - 1) {
      const s2 = surv;
      surv = addL(s2.length / 2, (i) => [{ win: s2[2 * i] }, { win: s2[2 * i + 1] }]);
    }
  }

  // Gran final y Reset
  const base = { bracket: 'GF' as const, round: 1, index: 0, bestOf: 5 as BestOf };
  defs.push({ ...base, id: 'GF1', label: 'Gran final', a: { win: W[k - 1][0] }, b: { win: surv[0] } });
  defs.push({ ...base, id: 'GF2', label: 'Gran final · Reset', a: { same: 'GF1', side: 'a' }, b: { same: 'GF1', side: 'b' } });
  return defs;
}

/** Un marcador solo es válido si el ganador llegó exactamente a las victorias necesarias y el rival no. */
export function validateScore(bestOf: BestOf, sa: number, sb: number): boolean {
  const need = winsNeeded(bestOf);
  if (!Number.isInteger(sa) || !Number.isInteger(sb) || sa < 0 || sb < 0) return false;
  return (sa === need && sb < need) || (sb === need && sa < need);
}

export function resolve(defs: MatchDef[], slots: Slot[], results: Record<string, Result>): Record<string, Resolved> {
  const out: Record<string, Resolved> = {};
  const pick = (s: Src): Slot => {
    if ('slot' in s) return slots[s.slot] ?? BYE;
    if ('win' in s) return out[s.win].winner;
    if ('lose' in s) return out[s.lose].loser;
    return out[s.same][s.side];
  };
  for (const def of defs) {
    let a = pick(def.a);
    let b = pick(def.b);
    let winner: Slot = null;
    let loser: Slot = null;
    let auto = false;
    let skipped = false;
    let result: Result | null = null;

    if (def.id === 'GF2') {
      const g = out.GF1;
      const needsReset = g.winner !== null && g.winner === g.b; // ganó el campeón del bracket de perdedores
      if (!needsReset) {
        out[def.id] = { def, a: null, b: null, winner: null, loser: null, result: null, auto: false, skipped: g.winner !== null };
        continue;
      }
    }

    if (a === BYE && b === BYE) { winner = BYE; loser = BYE; auto = true; }
    else if (a === BYE) { winner = b; loser = BYE; auto = true; }
    else if (b === BYE) { winner = a; loser = BYE; auto = true; }
    else if (a && b) {
      const r = results[def.id];
      if (
        r && validateScore(def.bestOf, r.score_a, r.score_b) &&
        ((r.winner === a && r.score_a > r.score_b) || (r.winner === b && r.score_b > r.score_a))
      ) {
        result = r;
        winner = r.winner;
        loser = r.winner === a ? b : a;
      }
    }
    out[def.id] = { def, a, b, winner, loser, result, auto, skipped };
  }
  return out;
}

export function standings(state: Record<string, Resolved>): { champion: Slot; runnerUp: Slot } {
  const none = { champion: null, runnerUp: null };
  const g1 = state.GF1;
  if (!g1 || !g1.winner) return none;
  if (g1.winner !== g1.b) {
    const other = g1.winner === g1.a ? g1.b : g1.a;
    return { champion: g1.winner, runnerUp: isReal(other) ? other : null };
  }
  const g2 = state.GF2;
  return g2 && g2.winner ? { champion: g2.winner, runnerUp: g2.loser } : none;
}

/** Victorias y derrotas reales por jugador. Los pases libres NO cuentan. */
export function tally(state: Record<string, Resolved>): Record<string, { wins: number; losses: number; gamesWon: number; gamesLost: number }> {
  const t: Record<string, { wins: number; losses: number; gamesWon: number; gamesLost: number }> = {};
  const row = (id: string) => (t[id] ??= { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0 });
  for (const m of Object.values(state)) {
    if (!m.result || m.auto || !isReal(m.winner) || !isReal(m.loser)) continue;
    const winnerIsA = m.winner === m.a;
    row(m.winner).wins++;
    row(m.loser).losses++;
    row(m.winner).gamesWon += winnerIsA ? m.result.score_a : m.result.score_b;
    row(m.winner).gamesLost += winnerIsA ? m.result.score_b : m.result.score_a;
    row(m.loser).gamesWon += winnerIsA ? m.result.score_b : m.result.score_a;
    row(m.loser).gamesLost += winnerIsA ? m.result.score_a : m.result.score_b;
  }
  return t;
}

/** Estado de una serie a partir de las partidas jugadas (ganador de cada una: 'a' o 'b'). */
export function seriesState(bestOf: BestOf, games: Side[]) {
  const need = winsNeeded(bestOf);
  let wa = 0;
  let wb = 0;
  let winner: Side | null = null;
  let valid = true;
  for (const g of games) {
    if (winner) { valid = false; break; } // se jugó de más: la serie ya estaba decidida
    if (g === 'a') wa++; else wb++;
    if (wa >= need) winner = 'a';
    else if (wb >= need) winner = 'b';
  }
  return { wa, wb, winner, finished: winner !== null, valid, nextGame: winner || !valid ? null : games.length + 1 };
}

/**
 * Quién envía la invitación en cada partida de la serie:
 * 1: el de arriba (a) · 2: el de abajo (b) · 3: el ganador de la partida 1
 * 4: el rival del que envió la 3 · 5: otra vez el ganador de la partida 1.
 */
export function inviter(gameNumber: number, firstWinner: Side | null): Side | null {
  if (gameNumber === 1) return 'a';
  if (gameNumber === 2) return 'b';
  if (!firstWinner || gameNumber > 5) return null;
  const other: Side = firstWinner === 'a' ? 'b' : 'a';
  return gameNumber === 4 ? other : firstWinner;
}

/** Reemplaza el formato (BO3/BO5) de partidos puntuales. Los valores inválidos se ignoran. */
export function withBestOf(defs: MatchDef[], overrides: Record<string, unknown>): MatchDef[] {
  return defs.map((d) => {
    const v = overrides[d.id];
    return v === 3 || v === 5 ? { ...d, bestOf: v } : d;
  });
}

/** Ids de los partidos de los que depende este partido. */
export function feeders(def: MatchDef): string[] {
  const out: string[] = [];
  for (const s of [def.a, def.b]) {
    if ('win' in s) out.push(s.win);
    else if ('lose' in s) out.push(s.lose);
    else if ('same' in s) out.push(s.same);
  }
  return out;
}
