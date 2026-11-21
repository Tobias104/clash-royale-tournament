import { useEffect, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch';
import { BYE } from './lib';
import type { Resolved, Slot } from './lib';
import { teamName } from './types';
import type { Team } from './types';

// Lienzo con las mismas medidas y posiciones que la primera página del PDF (1456 x 819).
const CW = 1456;
const CH = 819;
const PW = 109; // ancho de cada pastilla
type State = Record<string, Resolved>;
type Kind = 'white' | 'red' | 'gold' | 'champ';

interface PillDef {
  key: string;
  x: number;
  y: number;
  h?: number;
  kind?: Kind;
  open: string; // partido que se abre al tocar la pastilla
  seed?: number;
  ph?: string; // texto cuando todavía no hay jugador
  get: (s: State) => Slot;
}

const PILLS: PillDef[] = [
  // Cuartos de final
  { key: 'S1', x: 82, y: 73, open: 'A', seed: 1, get: (s) => s.A.a },
  { key: 'S2', x: 82, y: 114, open: 'A', seed: 2, get: (s) => s.A.b },
  { key: 'S3', x: 82, y: 190, open: 'B', seed: 3, get: (s) => s.B.a },
  { key: 'S4', x: 82, y: 230, open: 'B', seed: 4, get: (s) => s.B.b },
  { key: 'S5', x: 1262, y: 73, open: 'C', seed: 5, get: (s) => s.C.a },
  { key: 'S6', x: 1262, y: 114, open: 'C', seed: 6, get: (s) => s.C.b },
  { key: 'S7', x: 1262, y: 190, open: 'D', seed: 7, get: (s) => s.D.a },
  { key: 'S8', x: 1262, y: 230, open: 'D', seed: 8, get: (s) => s.D.b },
  // Semifinales y final
  { key: 'WA', x: 308, y: 93, open: 'SF1', get: (s) => s.A.winner },
  { key: 'WB', x: 308, y: 211, open: 'SF1', get: (s) => s.B.winner },
  { key: 'WC', x: 1033, y: 93, open: 'SF2', get: (s) => s.C.winner },
  { key: 'WD', x: 1033, y: 211, open: 'SF2', get: (s) => s.D.winner },
  { key: 'WSF1', x: 532, y: 151, open: 'F', get: (s) => s.SF1.winner },
  { key: 'WSF2', x: 805, y: 151, open: 'F', get: (s) => s.SF2.winner },
  // Gran final
  { key: 'WF', x: 673, y: 262, kind: 'gold', open: 'GF', ph: 'Ganador Final', get: (s) => s.F.winner },
  { key: 'CBP1', x: 673, y: 338, h: 42, open: 'GF', ph: 'Campeón Bracket Perdedor', get: (s) => s.REP.winner },
  { key: 'CHAMP', x: 888, y: 298, h: 41, kind: 'champ', open: 'GF', ph: 'Campeón del torneo', get: (s) => s.GF.winner },
  // Bracket de perdedores
  { key: 'LA', x: 82, y: 691, kind: 'red', open: 'LA', ph: 'Perdedor llave A', get: (s) => s.A.loser },
  { key: 'LD', x: 82, y: 731, kind: 'red', open: 'LA', ph: 'Perdedor llave D', get: (s) => s.D.loser },
  { key: 'LB', x: 1262, y: 690, kind: 'red', open: 'LB', ph: 'Perdedor llave B', get: (s) => s.B.loser },
  { key: 'LC', x: 1262, y: 730, kind: 'red', open: 'LB', ph: 'Perdedor llave C', get: (s) => s.C.loser },
  { key: 'LSF1', x: 308, y: 594, kind: 'red', open: 'LS1', ph: 'Perdedor Semifinal', get: (s) => s.SF1.loser },
  { key: 'LSF2', x: 1033, y: 594, kind: 'red', open: 'LS2', ph: 'Perdedor Semifinal', get: (s) => s.SF2.loser },
  { key: 'WLA', x: 308, y: 712, open: 'LS1', get: (s) => s.LA.winner },
  { key: 'WLB', x: 1033, y: 711, open: 'LS2', get: (s) => s.LB.winner },
  { key: 'WLS1', x: 532, y: 651, open: 'LF', get: (s) => s.LS1.winner },
  { key: 'WLS2', x: 805, y: 651, open: 'LF', get: (s) => s.LS2.winner },
  { key: 'WLF', x: 673, y: 544, open: 'REP', get: (s) => s.LF.winner },
  { key: 'LFP', x: 673, y: 477, h: 42, kind: 'red', open: 'REP', ph: 'Perdedor Final Bracket Principal', get: (s) => s.F.loser },
  { key: 'CBP2', x: 888, y: 506, h: 41, open: 'GF', ph: 'Campeón Bracket Perdedor', get: (s) => s.REP.winner },
];
const BY_KEY = new Map<string, PillDef>(PILLS.map((p) => [p.key, p] as [string, PillDef]));

interface Edge { d: string; from: string; match: string; arrow?: boolean; drop?: boolean }
const EDGES: Edge[] = [
  { d: 'M191 88.5H249V108.5H308', from: 'S1', match: 'A', arrow: true },
  { d: 'M191 129.5H249V108.5', from: 'S2', match: 'A' },
  { d: 'M191 205.5H249V226.5H308', from: 'S3', match: 'B', arrow: true },
  { d: 'M191 245.5H249V226.5', from: 'S4', match: 'B' },
  { d: 'M1262 88.5H1202V108.5H1142', from: 'S5', match: 'C', arrow: true },
  { d: 'M1262 129.5H1202V108.5', from: 'S6', match: 'C' },
  { d: 'M1262 205.5H1202V226.5H1142', from: 'S7', match: 'D', arrow: true },
  { d: 'M1262 245.5H1202V226.5', from: 'S8', match: 'D' },
  { d: 'M417 108.5H476V166.5H532', from: 'WA', match: 'SF1', arrow: true },
  { d: 'M417 226.5H476V166.5', from: 'WB', match: 'SF1' },
  { d: 'M1033 108.5H972V166.5H914', from: 'WC', match: 'SF2', arrow: true },
  { d: 'M1033 226.5H972V166.5', from: 'WD', match: 'SF2' },
  { d: 'M586.5 182V226.5H727.5V262', from: 'WSF1', match: 'F', arrow: true },
  { d: 'M859.5 182V226.5H727.5', from: 'WSF2', match: 'F' },
  { d: 'M782 277.5H832V318.5H888', from: 'WF', match: 'GF', arrow: true },
  { d: 'M782 359H832V318.5', from: 'CBP1', match: 'GF' },
  { d: 'M362.5 242V594', from: 'WB', match: 'SF1', arrow: true, drop: true },
  { d: 'M1087.5 242V594', from: 'WD', match: 'SF2', arrow: true, drop: true },
  { d: 'M191 706.5H249V727.5H308', from: 'LA', match: 'LA', arrow: true },
  { d: 'M191 746.5H249V727.5', from: 'LD', match: 'LA' },
  { d: 'M417 609.5H476V666.5H532', from: 'LSF1', match: 'LS1', arrow: true },
  { d: 'M417 727.5H476V666.5', from: 'WLA', match: 'LS1' },
  { d: 'M1262 705.5H1202V726.5H1142', from: 'LB', match: 'LB', arrow: true },
  { d: 'M1262 745.5H1202V726.5', from: 'LC', match: 'LB' },
  { d: 'M1033 609.5H972V666.5H914', from: 'LSF2', match: 'LS2', arrow: true },
  { d: 'M1033 726.5H972V666.5', from: 'WLB', match: 'LS2' },
  { d: 'M586.5 651V614H727.5V575', from: 'WLS1', match: 'LF', arrow: true },
  { d: 'M859.5 651V614H727.5', from: 'WLS2', match: 'LF' },
  { d: 'M782 498H833V526.5H888', from: 'LFP', match: 'REP', arrow: true },
  { d: 'M782 559.5H833V526.5', from: 'WLF', match: 'REP' },
];

const COLS = [
  { t: 'Cuartos de final', x: 82 },
  { t: 'Semifinal', x: 310 },
  { t: 'Final', x: 714, c: true },
  { t: 'Semifinal', x: 1035 },
  { t: 'Cuartos de final', x: 1222 },
];

const isReal = (v: Slot): v is string => !!v && v !== BYE;

function Controls({ fit }: { fit: number }) {
  const { zoomIn, zoomOut, centerView } = useControls();
  return (
    <div className="ctl">
      <button onClick={() => zoomIn(0.4, 250)} aria-label="Acercar">+</button>
      <button onClick={() => zoomOut(0.4, 250)} aria-label="Alejar">−</button>
      <button onClick={() => centerView(fit, 350)} aria-label="Ver todo el bracket">⤢</button>
    </div>
  );
}

interface Props {
  state: State;
  teams: Map<string, Team>;
  onOpen: (id: string) => void;
}

export default function BracketView({ state, teams, onOpen }: Props) {
  const down = useRef<[number, number] | null>(null);
  const [fit] = useState(() => Math.min(window.innerWidth / CW, window.innerHeight / CH) * 0.96);
  const [intro, setIntro] = useState(true);
  const [hint, setHint] = useState(true);
  useEffect(() => {
    const a = setTimeout(() => setIntro(false), 1800);
    const b = setTimeout(() => setHint(false), 9000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  const noTeams = teams.size === 0;
  const value = (p: PillDef): Slot => (noTeams ? null : p.get(state));
  const lit = (e: Edge): boolean => {
    if (noTeams) return false;
    const m = state[e.match];
    if (e.drop) return isReal(m.loser);
    const v = value(BY_KEY.get(e.from)!);
    return isReal(v) && m.winner === v;
  };

  return (
    <div className="stage">
      <TransformWrapper
        initialScale={fit}
        minScale={fit * 0.5}
        maxScale={4}
        centerOnInit
        limitToBounds={false}
        doubleClick={{ disabled: true }}
        wheel={{ step: 0.15 }}
        zoomAnimation={{ animationTime: 280, animationType: 'easeOutCubic' }}
        velocityAnimation={{ sensitivity: 1.2, animationTime: 500, animationType: 'easeOutCubic' }}
        alignmentAnimation={{ disabled: true }}
      >
        <Controls fit={fit} />
        <TransformComponent wrapperClass="zoomwrap" contentStyle={{ width: CW, height: CH }}>
          <div className="canvas" style={{ width: CW, height: CH }}>
            <img
              className="wm"
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt=""
              draggable={false}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <svg className="lines" width={CW} height={CH} aria-hidden="true">
              <defs>
                <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0 0L10 5L0 10z" fill="#4aa3ff" />
                </marker>
              </defs>
              {EDGES.map((e) => (
                <path key={e.d} d={e.d} className={'base' + (e.drop ? ' drop' : '')} markerEnd={e.arrow ? 'url(#ah)' : undefined} />
              ))}
              {EDGES.filter(lit).map((e) => (
                <path key={'l' + e.d} d={e.d} pathLength={1} className="lit" />
              ))}
            </svg>

            <div className="ttl" style={{ left: 82, top: 2 }}>Bracket Principal</div>
            <div className="ttl" style={{ left: 82, top: 448 }}>Bracket Perdedores</div>
            {[38, 776].map((y) =>
              COLS.map((c) => (
                <div key={y + c.t + c.x} className={'hd' + (c.c ? ' ctr' : '')} style={{ left: c.x, top: y }}>{c.t}</div>
              )),
            )}
            <div className="llave" style={{ left: 32, top: 101 }}>Llave A</div>
            <div className="llave" style={{ left: 32, top: 218 }}>Llave B</div>
            <div className="llave" style={{ left: 1387, top: 101 }}>Llave C</div>
            <div className="llave" style={{ left: 1387, top: 218 }}>Llave D</div>
            <div className="mid big" style={{ left: 525, top: 304 }}>GRAN FINAL</div>
            <div className="mid" style={{ left: 555, top: 514 }}>REPECHAJE</div>

            {PILLS.map((p) => {
              const v = value(p);
              const m = state[p.open];
              const real = isReal(v);
              const name = v === BYE ? '—' : v ? teamName(teams.get(v)) || '—' : '';
              const text = name || (noTeams && p.seed ? `Jugador ${p.seed}` : p.ph ?? '');
              const h = p.h ?? 31;
              const won = real && m.winner === v;
              const out = real && isReal(m.loser) && m.loser === v;
              const cls = ['pill', p.kind ?? 'white', real && 'real', won && 'won', out && 'out', h > 31 && 'tall', !text && 'blank']
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={p.key + (v ?? '')}
                  className={cls}
                  style={{ left: p.x, top: p.y, width: PW, height: h, animationDelay: intro ? `${((p.x / CW) * 0.9).toFixed(2)}s` : undefined }}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => { down.current = [e.clientX, e.clientY]; }}
                  onClick={(e) => {
                    const d = down.current;
                    if (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 6) return; // fue un arrastre
                    onOpen(p.open);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p.open); }}
                >
                  {p.kind === 'champ' && real ? (
                    <><small>Campeón del torneo</small><span>{name}</span></>
                  ) : (
                    <span>{text}</span>
                  )}
                </div>
              );
            })}
          </div>
        </TransformComponent>
      </TransformWrapper>
      {hint && <p className="hint">Arrastrá para moverte · rueda o pellizco para el zoom · tocá un jugador para ver su perfil</p>}
    </div>
  );
}
