import { useRef, useState } from 'react';
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch';
import { BYE, MATCHES, slotText } from './lib';
import type { Resolved } from './lib';
import type { Team } from './types';

const W = 210;
const H = 76;
const CW = 1400;
const CH = 830;

const POS: Record<string, [number, number]> = {
  A: [30, 50], B: [30, 190], C: [1160, 50], D: [1160, 190],
  SF1: [300, 120], SF2: [890, 120], F: [595, 120],
  GF: [595, 330], REP: [595, 480],
  LA: [30, 730], LB: [1160, 730], LS1: [300, 640], LS2: [890, 640], LF: [595, 640],
};
const WIN_EDGES: [string, string][] = [
  ['A', 'SF1'], ['B', 'SF1'], ['C', 'SF2'], ['D', 'SF2'], ['SF1', 'F'], ['SF2', 'F'], ['F', 'GF'],
  ['LA', 'LS1'], ['LB', 'LS2'], ['LS1', 'LF'], ['LS2', 'LF'], ['LF', 'REP'], ['REP', 'GF'],
];
const LOSE_EDGES: [string, string][] = [['SF1', 'LS1'], ['SF2', 'LS2']];
const LOSERS = new Set(['LA', 'LB', 'LS1', 'LS2', 'LF', 'REP']);

function path(a: string, b: string): string {
  const [ax, ay] = POS[a];
  const [bx, by] = POS[b];
  if (ax + W <= bx || bx + W <= ax) {
    const right = ax + W <= bx;
    const x1 = right ? ax + W : ax;
    const x2 = right ? bx : bx + W;
    const y1 = ay + H / 2;
    const y2 = by + H / 2;
    const m = (x1 + x2) / 2;
    return `M${x1} ${y1}H${m}V${y2}H${x2}`;
  }
  const cx = ax + W / 2;
  return by >= ay ? `M${cx} ${ay + H}V${by}` : `M${cx} ${ay}V${by + H}`;
}

function Controls({ fit }: { fit: number }) {
  const { zoomIn, zoomOut, centerView } = useControls();
  return (
    <div className="ctl">
      <button onClick={() => zoomIn()} aria-label="Acercar">+</button>
      <button onClick={() => zoomOut()} aria-label="Alejar">−</button>
      <button onClick={() => centerView(fit, 200)} aria-label="Ver todo">⤢</button>
    </div>
  );
}

interface Props {
  state: Record<string, Resolved>;
  teams: Map<string, Team>;
  onOpen: (id: string) => void;
}

export default function BracketView({ state, teams, onOpen }: Props) {
  const down = useRef<[number, number] | null>(null);
  const [fit] = useState(() => Math.min(1, window.innerWidth / (CW + 20)));

  return (
    <div className="stage">
      <TransformWrapper initialScale={fit} minScale={0.15} maxScale={3} centerOnInit limitToBounds={false} doubleClick={{ disabled: true }}>
        <Controls fit={fit} />
        <TransformComponent wrapperClass="zoomwrap" contentStyle={{ width: CW, height: CH }}>
          <div className="canvas" style={{ width: CW, height: CH }}>
            <svg width={CW} height={CH} className="lines" aria-hidden="true">
              {WIN_EDGES.map(([a, b]) => {
                const w = state[a].winner;
                return <path key={a + b} d={path(a, b)} className={w && w !== BYE ? 'done' : ''} />;
              })}
              {LOSE_EDGES.map(([a, b]) => <path key={a + b} d={path(a, b)} className="lose" />)}
            </svg>
            <div className="title" style={{ left: 30, top: 8 }}>Bracket Principal</div>
            <div className="title" style={{ left: 30, top: 590 }}>Bracket Perdedores</div>
            {MATCHES.map((def) => {
              const m = state[def.id];
              const [x, y] = POS[def.id];
              const rows: [typeof m.a, typeof def.a, number | undefined][] = [
                [m.a, def.a, m.result?.score_a],
                [m.b, def.b, m.result?.score_b],
              ];
              return (
                <div
                  key={def.id}
                  className={'m' + (LOSERS.has(def.id) ? ' lb' : '') + (def.id === 'GF' ? ' gf' : '')}
                  style={{ left: x, top: y, width: W, height: H }}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => { down.current = [e.clientX, e.clientY]; }}
                  onClick={(e) => {
                    const d = down.current;
                    if (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 6) return; // fue un arrastre
                    onOpen(def.id);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpen(def.id); }}
                >
                  <div className="mh">{def.label}</div>
                  {rows.map(([slot, src, score], i) => {
                    const { text, ph } = slotText(slot, src, teams);
                    const win = !!slot && slot !== BYE && m.winner === slot;
                    return (
                      <div key={i} className={'r' + (ph ? ' ph' : '') + (win ? ' w' : '')}>
                        <span className="n">{text}</span>
                        {score !== undefined && <b>{score}</b>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
