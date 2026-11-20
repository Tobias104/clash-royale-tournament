import { createClient } from 'npm:@supabase/supabase-js@2';
import { MATCHES, resolve, srcId, winsNeeded } from '../_shared/bracket.ts';
import type { Result } from '../_shared/bracket.ts';

interface TeamRow { id: string; seed: number | null; p1_tag: string; p2_tag: string | null }
interface Side { tag: string; crowns: number }
interface Battle { battleTime: string; team: Side[]; opponent: Side[] }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const norm = (t: string) => '#' + t.trim().toUpperCase().replace(/^#/, '');
// battleTime llega como 20261120T123000.000Z
const iso = (t: string) =>
  `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z`;
const teamKey = (t: TeamRow) => [t.p1_tag, t.p2_tag].filter((x): x is string => !!x).map(norm).sort().join(',');
const sideKey = (s: Side[]) => s.map((x) => norm(x.tag)).sort().join(',');

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
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Autorización: el cron manda x-cron-secret; el botón del panel manda el JWT de un admin.
    const secret = req.headers.get('x-cron-secret');
    let ok = !!secret && secret === Deno.env.get('CRON_SECRET');
    if (!ok) {
      const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
      const { data } = await sb.auth.getUser(token);
      const email = data.user?.email?.toLowerCase();
      if (email) {
        const { data: a } = await sb.from('admins').select('email').eq('email', email).maybeSingle();
        ok = !!a;
      }
    }
    if (!ok) return json({ error: 'No autorizado' }, 401);

    const [{ data: t }, { data: teamsData }, { data: rows }] = await Promise.all([
      sb.from('tournament').select('*').eq('id', 1).single(),
      sb.from('teams').select('*'),
      sb.from('results').select('*'),
    ]);
    if (!t?.started_at) return json({ skipped: 'El torneo no está iniciado' });

    const teams = (teamsData ?? []) as TeamRow[];
    const results = Object.fromEntries(((rows ?? []) as Result[]).map((r) => [r.match_id, r])) as Record<string, Result>;
    const seeds = Array.from({ length: 8 }, (_, i) => teams.find((x) => x.seed === i + 1)?.id ?? null);
    const state = resolve(seeds, results);
    const byId = new Map<string, TeamRow>(teams.map((x) => [x.id, x] as [string, TeamRow]));
    const need = winsNeeded(t.best_of);
    const saved: string[] = [];
    const errors: string[] = [];

    for (const def of MATCHES) {
      const m = state[def.id];
      if (m.result || m.auto || !m.a || !m.b) continue;
      const A = byId.get(m.a);
      const B = byId.get(m.b);
      if (!A || !B) continue;
      const ka = teamKey(A);
      const kb = teamKey(B);
      const tag = A.p1_tag || A.p2_tag;
      if (!ka || !kb || !tag) continue;

      // Solo cuentan batallas posteriores al inicio del torneo y al fin de los partidos que alimentan este.
      const feeders = [srcId(def.a), srcId(def.b)].filter((x): x is string => !!x);
      const since = Math.max(
        Date.parse(t.started_at),
        ...feeders.map((id) => (state[id].result ? Date.parse(state[id].result!.decided_at) : 0)),
      );

      try {
        const log = (await battlelog(tag)).sort((x, y) => x.battleTime.localeCompare(y.battleTime));
        let wa = 0;
        let wb = 0;
        let decidedAt: string | null = null;
        for (const b of log) {
          if (Date.parse(iso(b.battleTime)) <= since) continue;
          const tk = sideKey(b.team);
          const ok2 = sideKey(b.opponent);
          let aIsTeam: boolean;
          if (tk === ka && ok2 === kb) aIsTeam = true;
          else if (tk === kb && ok2 === ka) aIsTeam = false;
          else continue;
          const mine = b.team[0].crowns;
          const theirs = b.opponent[0].crowns;
          if (mine === theirs) continue; // empate: no cuenta
          if ((mine > theirs) === aIsTeam) wa++;
          else wb++;
          if (wa >= need || wb >= need) { decidedAt = iso(b.battleTime); break; }
        }
        if (decidedAt) {
          const { error } = await sb.from('results').upsert({
            match_id: def.id,
            winner: wa >= need ? A.id : B.id,
            score_a: wa,
            score_b: wb,
            source: 'api',
            decided_at: decidedAt,
          });
          if (error) throw new Error(error.message);
          saved.push(def.id);
        }
      } catch (e) {
        errors.push(`${def.id}: ${(e as Error).message}`);
      }
    }
    return json({ saved, errors });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
