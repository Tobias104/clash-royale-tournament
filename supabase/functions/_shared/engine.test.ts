// Ejecutar: node --experimental-strip-types supabase/functions/_shared/engine.test.ts
import assert from 'node:assert/strict';
import { BYE, buildBracket, inviter, isReal, resolve, seriesState, standings, tally, validateScore, winsNeeded } from './engine.ts';
import type { MatchDef, Resolved, Result, Side, Size, Slot } from './engine.ts';

let checks = 0;
const ok = (c: unknown, m: string) => { checks++; assert.ok(c, m); };

function rngOf(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function play(defs: MatchDef[], slots: Slot[], pick: (m: Resolved) => Side) {
  const results: Record<string, Result> = {};
  for (let i = 0; i < 200; i++) {
    const st = resolve(defs, slots, results);
    const next = defs.map((d) => st[d.id]).find((m) => !m.result && !m.auto && !m.skipped && isReal(m.a) && isReal(m.b));
    if (!next) return { results, st };
    const side = pick(next);
    const need = winsNeeded(next.def.bestOf);
    const lose = next.def.id.length % 2; // 0 o 1: cubre 2-0 y 2-1 (y 3-0/3-1)
    results[next.def.id] = {
      match_id: next.def.id,
      winner: (side === 'a' ? next.a : next.b) as string,
      score_a: side === 'a' ? need : lose,
      score_b: side === 'b' ? need : lose,
    };
  }
  throw new Error('el torneo no termina');
}

// 1) Estructura
for (const size of [8, 16] as Size[]) {
  const defs = buildBracket(size);
  ok(defs.length === 2 * size - 1, `cantidad de partidos ${size}`); // (N-1) principal + (N-2) perdedores + GF1 + GF2
  const ids = new Set(defs.map((d) => d.id));
  ok(ids.size === defs.length, 'ids únicos');
  const winUse: Record<string, number> = {};
  const loseUse: Record<string, number> = {};
  const order = new Map(defs.map((d, i) => [d.id, i]));
  for (const d of defs) for (const s of [d.a, d.b]) {
    if ('win' in s) { winUse[s.win] = (winUse[s.win] ?? 0) + 1; ok(order.get(s.win)! < order.get(d.id)!, 'depende de uno anterior'); }
    if ('lose' in s) { loseUse[s.lose] = (loseUse[s.lose] ?? 0) + 1; ok(order.get(s.lose)! < order.get(d.id)!, 'depende de uno anterior'); }
  }
  for (const d of defs.filter((x) => x.bracket === 'W')) ok(loseUse[d.id] === 1, `el perdedor de ${d.id} pasa al bracket de perdedores exactamente una vez`);
  for (const d of defs.filter((x) => x.bracket === 'L')) ok(!loseUse[d.id], `el perdedor de ${d.id} queda eliminado`);
  for (const d of defs.filter((x) => x.id !== 'GF1' && x.id !== 'GF2' && x.bracket !== 'GF')) ok(winUse[d.id] === 1, `el ganador de ${d.id} avanza exactamente una vez`);
  ok(defs.filter((d) => d.bracket === 'W').length === size - 1, 'partidos del bracket principal');
  ok(defs.filter((d) => d.bracket === 'L').length === size - 2, 'partidos del bracket de perdedores');
  ok(defs.filter((d) => d.bracket === 'GF').length === 2, 'gran final y reset');
  ok(defs.every((d) => d.bestOf === 3 || d.bestOf === 5), 'formatos');
  ok(defs.find((d) => d.id === 'GF1')!.bestOf === 5 && defs.find((d) => d.id === 'GF2')!.bestOf === 5, 'GF y Reset son BO5');
}
// El de 8 jugadores replica el PDF: llaves A-D cruzadas en perdedores, y semis con el perdedor de la semi vs el ganador de A-D / B-C
const d8 = buildBracket(8);
const get = (id: string) => d8.find((d) => d.id === id)!;
assert.deepEqual(get('L1.1').a, { lose: 'W1.1' }); assert.deepEqual(get('L1.1').b, { lose: 'W1.4' });
assert.deepEqual(get('L1.2').a, { lose: 'W1.2' }); assert.deepEqual(get('L1.2').b, { lose: 'W1.3' });
assert.deepEqual(get('L2.1').a, { lose: 'W2.1' }); assert.deepEqual(get('L2.1').b, { win: 'L1.1' });
assert.deepEqual(get('L4.1').a, { lose: 'W3.1' }); assert.deepEqual(get('L4.1').b, { win: 'L3.1' });
ok(get('W1.1').label === 'Llave A' && get('L4.1').label === 'Repechaje' && get('L3.1').label === 'Final bracket de perdedores', 'etiquetas');
ok(get('W1.1').bestOf === 3 && get('W3.1').bestOf === 5 && get('L1.1').bestOf === 3 && get('L3.1').bestOf === 5, 'BO3 inicial / BO5 avanzado');

// 2) Simulaciones aleatorias: cualquier cantidad de jugadores y cualquier ubicación de byes
for (const size of [8, 16] as Size[]) {
  const defs = buildBracket(size);
  for (let n = 1; n <= size; n++) {
    for (let rep = 0; rep < 40; rep++) {
      const rng = rngOf(n * 1000 + rep + size);
      const idx = Array.from({ length: size }, (_, i) => i).sort(() => rng() - 0.5).slice(0, n);
      const slots: Slot[] = Array.from({ length: size }, () => null);
      idx.forEach((s, i) => { slots[s] = `P${i + 1}`; });
      const { st } = play(defs, slots, () => (rng() < 0.5 ? 'a' : 'b'));
      const { champion } = standings(st);
      ok(isReal(champion), `hay campeón (size ${size}, n ${n})`);
      ok(defs.every((d) => st[d.id].result || st[d.id].auto || st[d.id].skipped), 'no quedan partidos sin resolver');
      const t = tally(st);
      for (let i = 1; i <= n; i++) {
        const id = `P${i}`;
        const losses = t[id]?.losses ?? 0;
        if (id === champion) ok(losses <= 1, 'el campeón tiene a lo sumo una derrota');
        else ok(losses === 2, `${id} fue eliminado con exactamente 2 derrotas (tiene ${losses}; size ${size}, n ${n})`);
      }
      // Un BYE nunca suma victoria ni derrota
      ok(!t[BYE], 'el BYE no tiene estadísticas');
      const real = Object.values(t).reduce((acc, r) => acc + r.wins, 0);
      ok(real === Object.values(st).filter((m) => m.result && !m.auto).length, 'las victorias coinciden con las series jugadas');
    }
  }
}

// 3) Gran Final y Reset
{
  const defs = buildBracket(8);
  const slots: Slot[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
  // a) gana siempre el de menor slot: P1 llega invicto y gana la primera final -> NO hay reset
  const a = play(defs, slots, (m) => (Number((m.a as string).slice(1)) < Number((m.b as string).slice(1)) ? 'a' : 'b'));
  ok(a.st.GF2.skipped && standings(a.st).champion === 'P1', 'sin Reset si gana el invicto');
  ok(tally(a.st).P1.losses === 0, 'P1 invicto');
  // b) el del bracket de perdedores gana la GF1 -> hay Reset; gana el reset el que venía invicto
  const b = play(defs, slots, (m) => (m.def.id === 'GF1' ? 'b' : m.def.id === 'GF2' ? 'a' : 'a'));
  ok(!b.st.GF2.skipped && b.st.GF2.winner === b.st.GF2.a, 'se juega el Reset');
  ok(standings(b.st).champion === b.st.GF2.a && standings(b.st).runnerUp === b.st.GF2.b, 'campeón del Reset');
  // c) el campeón del bracket de perdedores gana ambas
  const c = play(defs, slots, (m) => (m.def.id === 'GF1' || m.def.id === 'GF2' ? 'b' : 'a'));
  ok(standings(c.st).champion === c.st.GF1.b, 'el del bracket de perdedores puede ser campeón');
  ok(tally(c.st)[standings(c.st).champion as string].losses === 1, 'campeón con una derrota');
  // d) antes de jugar la GF1 no hay campeón ni Reset marcado como omitido
  const mid = resolve(defs, slots, {});
  ok(standings(mid).champion === null && !mid.GF2.skipped, 'sin campeón prematuro');
}

// 4) Resultados inválidos se ignoran (no se puede cerrar una serie antes de tiempo)
{
  const defs = buildBracket(8);
  const slots: Slot[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
  const bad = (a: number, b: number, w: string) => resolve(defs, slots, { 'W1.1': { match_id: 'W1.1', winner: w, score_a: a, score_b: b } })['W1.1'].result;
  ok(bad(1, 0, 'P1') === null, 'BO3 1-0 no está terminada');
  ok(bad(3, 0, 'P1') === null, 'BO3 3-0 es imposible');
  ok(bad(2, 2, 'P1') === null, 'BO3 2-2 es imposible');
  ok(bad(2, 0, 'P2') === null, 'ganador que no coincide con el marcador');
  ok(bad(2, 0, 'P9') === null, 'ganador que no juega el partido');
  ok(bad(2, 0, 'P1') !== null && bad(2, 1, 'P1') !== null && bad(0, 2, 'P2') !== null, 'BO3 2-0, 2-1 y 0-2 válidos');
}

// 5) Series BO3 / BO5
ok(validateScore(5, 3, 0) && validateScore(5, 3, 1) && validateScore(5, 3, 2) && validateScore(5, 0, 3), 'BO5 3-0, 3-1, 3-2');
ok(!validateScore(5, 2, 2) && !validateScore(5, 2, 0) && !validateScore(5, 4, 1) && !validateScore(3, -1, 2), 'BO5 inválidos');
{
  const s = seriesState(3, ['a', 'a']);
  ok(s.finished && s.winner === 'a' && s.wa === 2 && s.wb === 0 && s.nextGame === null && s.valid, 'BO3 2-0');
  const t = seriesState(3, ['a', 'b']);
  ok(!t.finished && t.nextGame === 3, 'BO3 1-1 sigue');
  ok(seriesState(3, ['a', 'b', 'b']).winner === 'b', 'BO3 1-2');
  ok(!seriesState(3, ['a', 'a', 'b']).valid, 'no se puede jugar de más');
  ok(seriesState(5, ['a', 'b', 'a', 'b']).nextGame === 5, 'BO5 2-2 va a la quinta');
  ok(seriesState(5, ['b', 'b', 'b']).winner === 'b' && seriesState(5, ['a', 'a', 'b', 'b', 'a']).winner === 'a', 'BO5 3-0 y 3-2');
}
// 6) Invitaciones
ok(inviter(1, null) === 'a' && inviter(2, null) === 'b', 'partidas 1 y 2');
ok(inviter(3, 'a') === 'a' && inviter(3, 'b') === 'b', 'la 3 la envía el ganador de la 1');
ok(inviter(4, 'a') === 'b' && inviter(4, 'b') === 'a', 'la 4 alterna');
ok(inviter(5, 'a') === 'a' && inviter(6, 'a') === null && inviter(3, null) === null, 'la 5 y límites');

console.log(`OK: ${checks} comprobaciones`);
