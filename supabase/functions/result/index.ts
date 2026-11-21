import { isReal, validateScore } from '../_shared/engine.ts';
import { admin, audit, cors, finalize, json, load, staffOf } from '../_shared/server.ts';

interface Body { tournament_id?: string; match_id?: string; score_a?: number; score_b?: number; clear?: boolean; confirm_cascade?: boolean }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = admin();
    const who = await staffOf(sb, req);
    if (!who || !['owner', 'admin'].includes(who.role)) return json({ error: 'No tenés permiso para cargar resultados.' });
    const b = (await req.json()) as Body;
    if (typeof b.tournament_id !== 'string' || typeof b.match_id !== 'string') return json({ error: 'Faltan datos.' });

    const ctx = await load(sb, b.tournament_id);
    if (!ctx) return json({ error: 'Torneo inexistente.' });
    if (ctx.t.status !== 'live') return json({ error: 'Solo se pueden cargar resultados en un torneo en curso.' });
    const m = ctx.state[b.match_id];
    if (!m || m.skipped || m.auto || !isReal(m.a) || !isReal(m.b)) return json({ error: 'Ese enfrentamiento todavía no tiene definidos a sus dos rivales.' });

    const old = ctx.results[b.match_id] ?? null;
    let row: Record<string, unknown> | null = null;
    if (!b.clear) {
      const sa = Number(b.score_a);
      const sb2 = Number(b.score_b);
      if (!validateScore(m.def.bestOf, sa, sb2)) {
        const need = Math.floor(m.def.bestOf / 2) + 1;
        return json({ error: `Resultado imposible: es un mejor de ${m.def.bestOf}, así que gana quien llega a ${need} victorias y el otro tiene menos.` });
      }
      row = { tournament_id: ctx.t.id, match_id: b.match_id, winner: sa > sb2 ? m.a : m.b, score_a: sa, score_b: sb2, source: 'manual', decided_at: new Date().toISOString() };
    } else if (!old) return json({ error: 'Ese enfrentamiento no tiene resultado para borrar.' });

    // Si cambia el ganador de algo ya decidido, se borran los resultados que dependían de él: hay que confirmarlo.
    const changesWinner = !!old && (b.clear || old.winner !== row!.winner);
    if (changesWinner) {
      const dep = new Set<string>([b.match_id]);
      for (let moved = true; moved;) {
        moved = false;
        for (const d of ctx.defs) {
          if (dep.has(d.id)) continue;
          if ([d.a, d.b].some((s) => ('win' in s && dep.has(s.win)) || ('lose' in s && dep.has(s.lose)) || ('same' in s && dep.has(s.same)))) { dep.add(d.id); moved = true; }
        }
      }
      const affected = [...dep].filter((id) => id !== b.match_id && ctx.state[id]?.result);
      if (affected.length && !b.confirm_cascade) return json({ needs_confirm: true, message: `Esto cambia quién avanza y borra ${affected.length} resultado(s) posteriores.` });
    }

    if (row) {
      const { error } = await sb.from('match_results').upsert(row);
      if (error) return json({ error: error.message });
    } else {
      const { error } = await sb.from('match_results').delete().eq('tournament_id', ctx.t.id).eq('match_id', b.match_id);
      if (error) return json({ error: error.message });
    }
    await audit(sb, who.email, row ? 'SET_RESULT' : 'CLEAR_RESULT', `${ctx.t.id}:${b.match_id}`, old, row);

    // Limpieza: se borra todo resultado que ya no corresponde al bracket actual
    let after = (await load(sb, ctx.t.id))!;
    for (const r of after.rows.filter((x) => !after.state[x.match_id]?.result)) {
      await sb.from('match_results').delete().eq('tournament_id', ctx.t.id).eq('match_id', r.match_id);
      await audit(sb, who.email, 'PRUNE_RESULT', `${ctx.t.id}:${r.match_id}`, r, null);
    }
    after = (await load(sb, ctx.t.id))!;
    const finished = await finalize(sb, after);
    return json({ ok: true, finished });
  } catch (e) {
    return json({ error: (e as Error).message });
  }
});
