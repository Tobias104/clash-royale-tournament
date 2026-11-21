import { useMemo, useState } from 'react';
import Admin from './Admin';
import BracketView from './BracketView';
import MatchModal from './MatchModal';
import { useAdmin, useData, useHash } from './hooks';
import { buildBracket, resolve, withBestOf } from './lib';
import type { Result, Size, Slot } from './lib';
import type { Participant } from './types';

export default function App() {
  const { t, participants, results, err, reload } = useData();
  const auth = useAdmin();
  const hash = useHash();
  const [open, setOpen] = useState<string | null>(null);

  const size: Size = t?.size === 16 ? 16 : 8;
  const parts = useMemo(() => new Map<string, Participant>(participants.map((p) => [p.id, p] as [string, Participant])), [participants]);
  const names = useMemo(() => new Map<string, string>(participants.map((p) => [p.id, p.display_name] as [string, string])), [participants]);
  const defs = useMemo(() => withBestOf(buildBracket(size), t?.bo_overrides ?? {}), [size, t?.bo_overrides]);
  const slots = useMemo(() => {
    const s: Slot[] = Array.from({ length: size }, () => null);
    for (const p of participants) if (p.slot < size) s[p.slot] = p.id;
    return s;
  }, [participants, size]);
  const state = useMemo(() => {
    const byMatch = Object.fromEntries(results.map((r) => [r.match_id, r])) as Record<string, Result>;
    return resolve(defs, slots, byMatch);
  }, [defs, slots, results]);

  const onAdmin = hash === '#admin';
  const title = t?.name ?? 'Torneo Clash Royale';
  const status = !t ? 'Sin torneo' : t.status === 'draft' ? 'Por comenzar' : t.status === 'live' ? 'En curso' : 'Finalizado';

  return (
    <div className="app">
      {onAdmin ? (
        <>
          <header className="top">
            <h1>{title}</h1>
            <a href="#">Ver bracket</a>
          </header>
          {err && <p className="note">No se pudo cargar el torneo: {err}</p>}
          <div className="scroll"><Admin auth={auth} t={t} participants={participants} reload={reload} /></div>
        </>
      ) : (
        <>
          <BracketView size={size} state={state} slots={slots} names={names} hasPlayers={participants.length > 0} onOpen={setOpen} />
          <nav className="chip">
            <span>{title} · {status}</span>
            <a href="#admin">{auth.isStaff ? 'Panel' : 'Admin'}</a>
          </nav>
          {err && <p className="note float">No se pudo cargar el torneo: {err}</p>}
        </>
      )}
      {open && !onAdmin && t && state[open] && (
        <MatchModal key={open} m={state[open]} tournament={t} parts={parts} names={names} defs={defs} canAdmin={auth.canAdmin} onClose={() => setOpen(null)} reload={reload} />
      )}
    </div>
  );
}
