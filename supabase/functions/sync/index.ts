import { feeders, isReal, winsNeeded } from '../_shared/engine.ts';
import { admin, audit, cors, finalize, json, load, staffOf } from '../_shared/server.ts';

interface BSide { tag: string; crowns: number }
interface Battle { battleTime: string; team: BSide[]; opponent: BSide[] }

const norm = (t: string) => '#' + t.trim().toUpperCase().replace(/^#/, '');
// battleTime llega como 20261120T123000.000Z
const iso = (t: string) => `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z`;
const key = (s: BSide[]) => s.map((x) => norm(x.tag)).sort().join(',');

async function battlelog(tag: string): Promise<Battle[]> {
  const r = await fetch(`https://proxy.royaleapi.dev/v1/players/${encodeURIComponent(norm(tag))}/battlelog`, {
    headers: { Authorization: `Bearer ${Deno.env.get('CR_API_KEY')}` },
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return (await r.json()) as Battle[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = admin();
    // El cron manda x-cron-secret; el botón del panel manda el JWT de alguien del personal.
    const secret = req.headers.get('x-cron-secret');
    let ok = !!secret && secret === Deno.env.get('CRON_SECRET');
    if (!ok) {
      const who = await staffOf(sb, req);
      ok = !!who && ['owner', 'admin', 'organizer'].includes(who.role);
    }
    if (!ok) return json({ error: 'No autorizado' }, 401);

    const { data: live } = await sb.from('tournaments').select('id').eq('status', 'live').eq('sync_enabled', true);
    const saved: string[] = [];
    const errors: string[] = [];

    for (const { id } of (live ?? []) as { id: string }[]) {
      const ctx = await load(sb, id);
      if (!ctx || !ctx.t.start_at) continue;
      const byId = new Map(ctx.parts.map((p) => [p.id, p]));
      for (const def of ctx.defs) {
        const m = ctx.state[def.id];
        if (m.result || m.auto || m.skipped || !isReal(m.a) || !isReal(m.b)) continue;
        const A = byId.get(m.a);
        const B = byId.get(m.b);
        if (!A || !B) continue;
        // Solo cuentan batallas posteriores al inicio y al fin de los partidos que alimentan este.
        const since = Math.max(Date.parse(ctx.t.start_at), ...feeders(def).map((f) => (ctx.results[f] ? Date.parse(ctx.results[f].decided_at) : 0)));
        const need = winsNeeded(def.bestOf);
        try {
          const log = (await battlelog(A.player_tag)).sort((x, y) => x.battleTime.localeCompare(y.battleTime));
          const ka = norm(A.player_tag);
          const kb = norm(B.player_tag);
          let wa = 0;
          let wb = 0;
          let decidedAt: string | null = null;
          for (const b of log) {
            if (Date.parse(iso(b.battleTime)) <= since) continue;
            const tk = key(b.team);
            const ok2 = key(b.opponent);
            let aIsTeam: boolean;
            if (tk === ka && ok2 === kb) aIsTeam = true;
            else if (tk === kb && ok2 === ka) aIsTeam = false;
            else continue;
            const mine = b.team[0].crowns;
            const theirs = b.opponent[0].crowns;
            if (mine === theirs) continue; // empate: no cuenta
            if ((mine > theirs) === aIsTeam) wa++; else wb++;
            if (wa >= need || wb >= need) { decidedAt = iso(b.battleTime); break; }
          }
          if (decidedAt) {
            const row = { tournament_id: id, match_id: def.id, winner: wa >= need ? A.id : B.id, score_a: wa, score_b: wb, source: 'api', decided_at: decidedAt };
            const { error } = await sb.from('match_results').upsert(row);
            if (error) throw new Error(error.message);
            await audit(sb, 'sync (RoyaleAPI)', 'SET_RESULT', `${id}:${def.id}`, null, row);
            saved.push(def.id);
          }
        } catch (e) {
          errors.push(`${def.id}: ${(e as Error).message}`);
        }
      }
      if (saved.length) { const again = await load(sb, id); if (again) await finalize(sb, again); }
    }
    return json({ saved, errors });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
