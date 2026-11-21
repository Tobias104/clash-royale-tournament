import { useEffect, useState } from 'react';
import { sb } from './supabase';
import { BYE, isReal, slotText, winsNeeded } from './lib';
import type { MatchDef, Resolved } from './lib';
import type { Participant, Tournament } from './types';

interface Profile {
  error?: string;
  name: string;
  tag: string;
  expLevel: number;
  trophies: number;
  bestTrophies: number;
  wins: number;
  losses: number;
  battleCount: number;
  threeCrownWins: number;
  arena: string | null;
  clan: { name: string; tag: string } | null;
  pathOfLegend: { league: number; trophies: number; rank: number | null } | null;
  deck: { name: string; icon: string | null }[];
}

function PlayerCard({ p }: { p: Participant }) {
  const [s, setS] = useState<{ loading: boolean; data?: Profile; error?: string }>({ loading: true });
  useEffect(() => {
    let alive = true;
    void sb.functions.invoke<Profile>('player', { body: { tag: p.player_tag } }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data || data.error) setS({ loading: false, error: data?.error ?? 'No se pudo cargar el perfil' });
      else setS({ loading: false, data });
    });
    return () => { alive = false; };
  }, [p.player_tag]);

  const d = s.data;
  return (
    <div className="pc">
      <h4>{p.display_name}</h4>
      <a href={`https://royaleapi.com/player/${p.player_tag.replace('#', '')}`} target="_blank" rel="noreferrer">{p.player_tag}</a>
      {p.clan_name && <p className="mut">Clan: {p.clan_name}</p>}
      {s.loading && <p className="mut">Cargando perfil…</p>}
      {s.error && <p className="err">{s.error}</p>}
      {d && (
        <>
          <dl>
            <dt>Cuenta</dt><dd>{d.name}</dd>
            <dt>Nivel</dt><dd>{d.expLevel}</dd>
            <dt>Trofeos</dt><dd>{d.trophies} (récord {d.bestTrophies})</dd>
            <dt>Victorias</dt><dd>{d.wins} / {d.losses} derrotas</dd>
            <dt>Triple corona</dt><dd>{d.threeCrownWins}</dd>
            <dt>Batallas</dt><dd>{d.battleCount}</dd>
            {d.arena && (<><dt>Arena</dt><dd>{d.arena}</dd></>)}
            {d.pathOfLegend && (<><dt>Camino de leyendas</dt><dd>Liga {d.pathOfLegend.league}, {d.pathOfLegend.trophies} trofeos</dd></>)}
          </dl>
          <div className="deck">
            {d.deck.map((c) => (c.icon ? <img key={c.name} src={c.icon} alt={c.name} title={c.name} /> : <span key={c.name}>{c.name}</span>))}
          </div>
        </>
      )}
    </div>
  );
}

function Side({ part, ph, win, score }: { part?: Participant; ph: string; win: boolean; score?: number }) {
  return (
    <section className={'side' + (win ? ' win' : '')}>
      <h3>
        <span>{part ? part.display_name : ph}</span>
        {score !== undefined && <span className="sc">{score}</span>}
      </h3>
      {part && <PlayerCard p={part} />}
    </section>
  );
}

interface Props {
  m: Resolved;
  tournament: Tournament;
  parts: Map<string, Participant>;
  names: Map<string, string>;
  defs: MatchDef[];
  canAdmin: boolean;
  onClose: () => void;
  reload: () => Promise<void>;
}

export default function MatchModal({ m, tournament, parts, names, defs, canAdmin, onClose, reload }: Props) {
  const A = isReal(m.a) ? parts.get(m.a) : undefined;
  const B = isReal(m.b) ? parts.get(m.b) : undefined;
  const [scoreA, setScoreA] = useState(m.result?.score_a ?? 0);
  const [scoreB, setScoreB] = useState(m.result?.score_b ?? 0);
  const [msg, setMsg] = useState('');
  const need = winsNeeded(m.def.bestOf);

  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);

  async function send(extra: Record<string, unknown>): Promise<void> {
    const { data, error } = await sb.functions.invoke<{ ok?: boolean; error?: string; needs_confirm?: boolean; message?: string }>('result', {
      body: { tournament_id: tournament.id, match_id: m.def.id, ...extra },
    });
    if (error || !data) { setMsg('No se pudo contactar con el servidor.'); return; }
    if (data.needs_confirm) {
      if (window.confirm(`${data.message ?? ''} ¿Querés continuar?`)) return send({ ...extra, confirm_cascade: true });
      return;
    }
    if (data.error) { setMsg(data.error); return; }
    setMsg('Guardado.');
    await reload();
  }

  const status = m.result
    ? `Finalizado (${m.result.winner === m.a ? 'ganó el de arriba' : 'ganó el de abajo'})`
    : m.auto ? 'Pase libre' : m.skipped ? 'No hace falta jugarlo' : isReal(m.a) && isReal(m.b) ? 'Pendiente de jugarse' : 'Esperando rivales';
  const phA = slotText(m.a, m.def.a, names, defs);
  const phB = slotText(m.b, m.def.b, names, defs);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={m.def.label} onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Cerrar">×</button>
        <h2>{m.def.label}</h2>
        <p className="mut">{status} · Mejor de {m.def.bestOf}: gana quien llega a {need} victorias</p>
        <div className="vs">
          <Side part={A} ph={phA} win={!!A && m.winner === m.a} score={m.result?.score_a} />
          <Side part={B} ph={phB} win={!!B && m.winner === m.b} score={m.result?.score_b} />
        </div>
        {canAdmin && tournament.status === 'live' && A && B && (
          <div className="adm">
            <h3>Cargar o corregir resultado</h3>
            <label>Victorias de {A.display_name} <input type="number" min={0} max={need} value={scoreA} onChange={(e) => setScoreA(Number(e.target.value))} /></label>
            <label>Victorias de {B.display_name} <input type="number" min={0} max={need} value={scoreB} onChange={(e) => setScoreB(Number(e.target.value))} /></label>
            <div className="row">
              <button onClick={() => void send({ score_a: scoreA, score_b: scoreB })}>Guardar resultado</button>
              {m.result && <button className="ghost" onClick={() => void send({ clear: true })}>Borrar resultado</button>}
            </div>
            {msg && <p className="mut">{msg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
