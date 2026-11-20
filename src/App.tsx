import { useMemo, useState } from 'react';
import Admin from './Admin';
import BracketView from './BracketView';
import MatchModal from './MatchModal';
import { useAdmin, useData, useHash } from './hooks';
import { BYE, resolve } from './lib';
import type { Result } from './lib';
import { teamName } from './types';
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

  const champ = state.GF.winner && state.GF.winner !== BYE ? teamMap.get(state.GF.winner) : undefined;
  const onAdmin = hash === '#admin';

  return (
    <div className="app">
      <header className="top">
        <h1>{t?.name ?? 'Torneo Clash Royale'}</h1>
        {champ && <span className="champ">Campeón: {teamName(champ)}</span>}
        <a href={onAdmin ? '#' : '#admin'}>{onAdmin ? 'Ver bracket' : auth.isAdmin ? 'Panel' : 'Admin'}</a>
      </header>
      {err && <p className="note">No se pudo cargar el torneo: {err}</p>}
      {onAdmin ? (
        <div className="scroll"><Admin auth={auth} t={t} teams={teams} reload={reload} /></div>
      ) : (
        <BracketView state={state} teams={teamMap} onOpen={setOpen} />
      )}
      {open && !onAdmin && (
        <MatchModal key={open} m={state[open]} teams={teamMap} isAdmin={auth.isAdmin} onClose={() => setOpen(null)} reload={reload} />
      )}
    </div>
  );
}
