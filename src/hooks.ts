import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb } from './supabase';
import type { Team, Tournament } from './types';
import type { Result } from './lib';

export function useData() {
  const [t, setT] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      sb.from('tournament').select('*').eq('id', 1).single(),
      sb.from('teams').select('*'),
      sb.from('results').select('*'),
    ]);
    if (a.error || b.error || c.error) {
      setErr((a.error ?? b.error ?? c.error)!.message);
      return;
    }
    setT(a.data as Tournament);
    setTeams(b.data as Team[]);
    setResults(c.data as Result[]);
    setErr('');
  }, []);

  useEffect(() => {
    void load();
    const ch = sb
      .channel('torneo')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => void load())
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [load]);

  return { t, teams, results, err, reload: load };
}

export interface AdminState {
  ready: boolean;
  email: string | null;
  isAdmin: boolean;
  isOwner: boolean;
}

export function useAdmin(): AdminState {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [flags, setFlags] = useState({ isAdmin: false, isOwner: false });

  useEffect(() => {
    void sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const email = session?.user.email?.toLowerCase() ?? null;
  useEffect(() => {
    if (!email) {
      setFlags({ isAdmin: false, isOwner: false });
      return;
    }
    void sb
      .from('admins')
      .select('is_owner')
      .eq('email', email)
      .maybeSingle()
      .then(({ data }) => setFlags({ isAdmin: !!data, isOwner: !!data?.is_owner }));
  }, [email]);

  return { ready, email, ...flags };
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
