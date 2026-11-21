import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildBracket, isReal, resolve, standings, withBestOf } from './engine.ts';
import type { MatchDef, Resolved, Result, Slot } from './engine.ts';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
export type Client = ReturnType<typeof admin>;

/** Quién llama: valida el JWT del usuario y busca su rol en la tabla staff. */
export async function staffOf(sb: Client, req: Request): Promise<{ email: string; role: string } | null> {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data } = await sb.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: s } = await sb.from('staff').select('role').eq('email', email).maybeSingle();
  return s ? { email, role: s.role as string } : null;
}

export interface Part { id: string; slot: number; display_name: string; player_tag: string }
export interface Ctx {
  t: { id: string; size: number; status: string; start_at: string | null; bo_overrides: Record<string, unknown> };
  parts: Part[];
  rows: (Result & { decided_at: string })[];
  slots: Slot[];
  defs: MatchDef[];
  results: Record<string, Result & { decided_at: string }>;
  state: Record<string, Resolved>;
}

export async function load(sb: Client, tournamentId: string): Promise<Ctx | null> {
  const [{ data: t }, { data: parts }, { data: rows }] = await Promise.all([
    sb.from('tournaments').select('*').eq('id', tournamentId).maybeSingle(),
    sb.from('participants').select('*').eq('tournament_id', tournamentId),
    sb.from('match_results').select('*').eq('tournament_id', tournamentId),
  ]);
  if (!t) return null;
  const slots: Slot[] = Array.from({ length: t.size }, () => null);
  for (const p of (parts ?? []) as Part[]) slots[p.slot] = p.id;
  const defs = withBestOf(buildBracket(t.size), t.bo_overrides ?? {});
  const list = (rows ?? []) as (Result & { decided_at: string })[];
  const results = Object.fromEntries(list.map((r) => [r.match_id, r])) as Ctx['results'];
  return { t, parts: (parts ?? []) as Part[], rows: list, slots, defs, results, state: resolve(defs, slots, results) };
}

export async function audit(sb: Client, actor: string, action: string, key: string, oldData: unknown, newData: unknown) {
  await sb.from('audit_log').insert({ actor, action, table_name: 'match_results', row_key: key, old_data: oldData, new_data: newData });
}

/** Si el torneo ya tiene campeón, lo cierra y lo deja como historial. */
export async function finalize(sb: Client, ctx: Ctx): Promise<boolean> {
  if (ctx.t.status !== 'live') return false;
  const { champion, runnerUp } = standings(ctx.state);
  if (!isReal(champion)) return false;
  const { error } = await sb.from('tournaments').update({
    status: 'finished', champion_id: champion, runner_up_id: isReal(runnerUp) ? runnerUp : null, finished_at: new Date().toISOString(),
  }).eq('id', ctx.t.id);
  return !error;
}
