import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb } from './supabase';
import type { Participant, Role, Tournament } from './types';
import type { Result } from './lib';

export type ResultRow = Result & { decided_at: string; source: string };

/** Carga el torneo más reciente (en curso, borrador o el último finalizado) y se actualiza en tiempo real. */
export function useData() {
  const [t, setT] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const a = await sb.from('tournaments').select('*').order('created_at', { ascending: false }).limit(1);
    if (a.error) { setErr(a.error.message); return; }
    const cur = ((a.data ?? [])[0] ?? null) as Tournament | null;
    if (!cur) { setT(null); setParticipants([]); setResults([]); setErr(''); return; }
    const [b, c] = await Promise.all([
      sb.from('participants').select('*').eq('tournament_id', cur.id),
      sb.from('match_results').select('*').eq('tournament_id', cur.id),
    ]);
    if (b.error || c.error) { setErr((b.error ?? c.error)!.message); return; }
    setT(cur);
    setParticipants(b.data as Participant[]);
    setResults(c.data as ResultRow[]);
    setErr('');
  }, []);

  useEffect(() => {
    void load();
    const ch = sb
      .channel('torneo')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => void load())
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [load]);

  return { t, participants, results, err, reload: load };
}

export interface AdminState {
  ready: boolean;
  email: string | null;
  role: Role | null;
  isStaff: boolean;
  canOrganize: boolean; // crear torneos y cargar participantes
  canAdmin: boolean; // cargar y corregir resultados
  isOwner: boolean;
}

export function useAdmin(): AdminState {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    void sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const email = session?.user.email?.toLowerCase() ?? null;
  useEffect(() => {
    if (!email) { setRole(null); return; }
    void sb.from('staff').select('role').eq('email', email).maybeSingle().then(({ data }) => setRole((data?.role as Role | undefined) ?? null));
  }, [email]);

  return {
    ready, email, role,
    isStaff: role !== null,
    canOrganize: role === 'owner' || role === 'admin' || role === 'organizer',
    canAdmin: role === 'owner' || role === 'admin',
    isOwner: role === 'owner',
  };
}

export function useHash(): string {
  const [h, setH] = useState(window.location.hash);
  useEffect(() => {
    const f = () => setH(window.location.hash);
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}
