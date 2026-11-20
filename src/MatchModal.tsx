import { useEffect, useState } from 'react';
import { sb } from './supabase';
import { BYE, slotText } from './lib';
import type { Resolved } from './lib';
import { teamName } from './types';
import type { Team } from './types';

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

function PlayerCard({ name, tag }: { name: string; tag: string }) {
  const [s, setS] = useState<{ loading: boolean; data?: Profile; error?: string }>({ loading: true });
  useEffect(() => {
    let alive = true;
    void sb.functions.invoke<Profile>('player', { body: { tag } }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data || data.error) setS({ loading: false, error: data?.error ?? 'No se pudo cargar el perfil' });
      else setS({ loading: false, data });
    });
    return () => { alive = false; };
  }, [tag]);

  const p = s.data;
  const url = `https://royaleapi.com/player/${tag.replace('#', '').toUpperCase()}`;
  return (
    <div className="pc">
      <h4>{p?.name ?? name}</h4>
      <a href={url} target="_blank" rel="noreferrer">{tag.toUpperCase()}</a>
      {s.loading && <p className="mut">Cargando perfil…</p>}
      {s.error && <p className="err">{s.error}</p>}
      {p && (
        <>
          <dl>
            <dt>Nivel</dt><dd>{p.expLevel}</dd>
            <dt>Trofeos</dt><dd>{p.trophies} (récord {p.bestTrophies})</dd>
            <dt>Victorias</dt><dd>{p.wins} / {p.losses} derrotas</dd>
            <dt>Triple corona</dt><dd>{p.threeCrownWins}</dd>
            <dt>Batallas</dt><dd>{p.battleCount}</dd>
            {p.clan && (<><dt>Clan</dt><dd>{p.clan.name}</dd></>)}
            {p.arena && (<><dt>Arena</dt><dd>{p.arena}</dd></>)}
            {p.pathOfLegend && (<><dt>Camino de leyendas</dt><dd>Liga {p.pathOfLegend.league}, {p.pathOfLegend.trophies} trofeos</dd></>)}
          </dl>
          <div className="deck">
            {p.deck.map((c) => (c.icon ? <img key={c.name} src={c.icon} alt={c.name} title={c.name} /> : <span key={c.name}>{c.name}</span>))}
          </div>
        </>
      )}
    </div>
  );
}

function Side({ team, ph, win, score }: { team?: Team; ph: string; win: boolean; score?: number }) {
  return (
    <section className={'side' + (win ? ' win' : '')}>
      <h3>
        <span>{team ? teamName(team) : ph}</span>
        {score !== undefined && <span className="sc">{score}</span>}
      </h3>
      {team && (
        <div className="players">
          <PlayerCard name={team.p1_name} tag={team.p1_tag} />
          {team.p2_tag && <PlayerCard name={team.p2_name ?? ''} tag={team.p2_tag} />}
        </div>
      )}
    </section>
  );
}

interface Props {
  m: Resolved;
  teams: Map<string, Team>;
  isAdmin: boolean;
  onClose: () => void;
  reload: () => Promise<void>;
}

export default function MatchModal({ m, teams, isAdmin, onClose, reload }: Props) {
  const A = m.a && m.a !== BYE ? teams.get(m.a) : undefined;
  const B = m.b && m.b !== BYE ? teams.get(m.b) : undefined;
  const [scoreA, setScoreA] = useState(m.result?.score_a ?? 0);
  const [scoreB, setScoreB] = useState(m.result?.score_b ?? 0);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);

  async function save(winner: string) {
    const { error } = await sb.from('results').upsert({
      match_id: m.def.id, winner, score_a: scoreA, score_b: scoreB, source: 'manual', decided_at: new Date().toISOString(),
    });
    setMsg(error ? error.message : 'Resultado guardado');
    if (!error) await reload();
  }
  async function clear() {
    const { error } = await sb.from('results').delete().eq('match_id', m.def.id);
    setMsg(error ? error.message : 'Resultado borrado');
    if (!error) await reload();
  }

  const status = m.result
    ? `Finalizado (${m.result.source === 'api' ? 'detectado por la API' : 'cargado a mano'})`
    : m.auto ? 'Pase libre' : A && B ? 'Pendiente de jugarse' : 'Esperando rivales';

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={m.def.label} onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Cerrar">×</button>
        <h2>{m.def.label}</h2>
        <p className="mut">{status}</p>
        <div className="vs">
          <Side team={A} ph={slotText(m.a, m.def.a, teams).text} win={!!m.winner && m.winner === m.a && !!A} score={m.result?.score_a} />
          <Side team={B} ph={slotText(m.b, m.def.b, teams).text} win={!!m.winner && m.winner === m.b && !!B} score={m.result?.score_b} />
        </div>
        {isAdmin && A && B && (
          <div className="adm">
            <h3>Corregir resultado</h3>
            <label>Victorias de {teamName(A)} <input type="number" min={0} value={scoreA} onChange={(e) => setScoreA(Number(e.target.value))} /></label>
            <label>Victorias de {teamName(B)} <input type="number" min={0} value={scoreB} onChange={(e) => setScoreB(Number(e.target.value))} /></label>
            <div className="row">
              <button onClick={() => void save(A.id)}>Gana {teamName(A)}</button>
              <button onClick={() => void save(B.id)}>Gana {teamName(B)}</button>
              {m.result && <button className="ghost" onClick={() => void clear()}>Borrar resultado</button>}
            </div>
            {msg && <p className="mut">{msg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
