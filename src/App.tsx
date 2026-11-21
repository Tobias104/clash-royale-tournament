import { useMemo, useState } from 'react';
import Admin from './Admin';
import BracketView from './BracketView';
import MatchModal from './MatchModal';
import { useAdmin, useData, useHash } from './hooks';
import { resolve } from './lib';
import type { Result } from './lib';
import type { Team } from './types';

export default function App() {
  const { t, teams, results, err, reload } = useData();
  const auth = useAdmin();
  const hash = useHash();
  const [open, setOpen] = useState<string | null>(null);

  const teamMap = useMemo(() => new Map<string, Team>(teams.map((x) => [x.id, x] as [string, Team])), [teams]);
  const state = useMemo(() => {
    const seeds = Array.from({ length: 8 }, (_, i) => teams.find((x) => x.seed === i + 1)?.id ?? null);
    const byMatch = Object.fromEntries(results.map((r) => [r.match_id, r])) as Record<string, Result>;
    return resolve(seeds, byMatch);
  }, [teams, results]);

  const onAdmin = hash === '#admin';
  const title = t?.name ?? 'Torneo Clash Royale';

  return (
    <div className="app">
      {onAdmin ? (
        <>
          <header className="top">
            <h1>{title}</h1>
            <a href="#">Ver bracket</a>
          </header>
          {err && <p className="note">No se pudo cargar el torneo: {err}</p>}
          <div className="scroll"><Admin auth={auth} t={t} teams={teams} reload={reload} /></div>
        </>
      ) : (
        <>
          <BracketView state={state} teams={teamMap} onOpen={setOpen} />
          <nav className="chip">
            <span>{title}</span>
            <a href="#admin">{auth.isAdmin ? 'Panel' : 'Admin'}</a>
          </nav>
          {err && <p className="note float">No se pudo cargar el torneo: {err}</p>}
        </>
      )}
      {open && !onAdmin && (
        <MatchModal key={open} m={state[open]} teams={teamMap} isAdmin={auth.isAdmin} onClose={() => setOpen(null)} reload={reload} />
      )}
    </div>
  );
}
