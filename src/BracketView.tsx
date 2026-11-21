import { useRef, useState, useEffect } from 'react';
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch';
import { BYE, isReal, standings } from './lib';
import type { Resolved, Size, Slot, Src } from './lib';
import { buildLayout, PW } from './layout';
import type { EdgeL, PillL } from './layout';

type State = Record<string, Resolved>;

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
  size: Size;
  state: State;
  slots: Slot[];
  names: Map<string, string>;
  hasPlayers: boolean;
  onOpen: (id: string) => void;
}

export default function BracketView({ size, state, slots, names, hasPlayers, onOpen }: Props) {
  const L = buildLayout(size);
  const down = useRef<[number, number] | null>(null);
  const fit = Math.min(window.innerWidth / L.w, window.innerHeight / L.h) * 0.96;
  const [intro, setIntro] = useState(true);
  const [hint, setHint] = useState(true);
  useEffect(() => {
    const a = setTimeout(() => setIntro(false), 1800);
    const b = setTimeout(() => setHint(false), 9000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  const byKey = new Map<string, PillL>(L.pills.map((p) => [p.key, p] as [string, PillL]));
  const value = (ref: Src | 'champ'): Slot => {
    if (!hasPlayers) return null;
    if (ref === 'champ') return standings(state).champion;
    if ('slot' in ref) return slots[ref.slot] ?? BYE;
    if ('win' in ref) return state[ref.win].winner;
    if ('lose' in ref) return state[ref.lose].loser;
    return null;
  };
  const lit = (e: EdgeL): boolean => {
    if (!hasPlayers) return false;
    const m = state[e.match];
    if (e.drop) return isReal(m.loser);
    const v = value(byKey.get(e.from)!.ref);
    return isReal(v) && m.winner === v;
  };
  const g2 = state.GF2;
  const showReset = !!g2 && !g2.skipped && isReal(g2.a) && isReal(g2.b);

  return (
    <div className="stage">
      <TransformWrapper
        key={size}
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
        <TransformComponent wrapperClass="zoomwrap" contentStyle={{ width: L.w, height: L.h }}>
          <div className="canvas" style={{ width: L.w, height: L.h }}>
            <img
              className="wm"
              style={{ left: L.w / 2 - 235 }}
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt=""
              draggable={false}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <svg className="lines" width={L.w} height={L.h} aria-hidden="true">
              <defs>
                <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0 0L10 5L0 10z" fill="#4aa3ff" />
                </marker>
              </defs>
              {L.edges.map((e) => (
                <path key={e.d} d={e.d} className={'base' + (e.drop ? ' drop' : '')} markerEnd={e.arrow ? 'url(#ah)' : undefined} />
              ))}
              {L.edges.filter(lit).map((e) => (
                <path key={'l' + e.d} d={e.d} pathLength={1} className="lit" />
              ))}
            </svg>

            {L.texts.map((t, i) => (
              <div key={i} className={t.cls} style={{ left: t.x, top: t.y }}>{t.t}</div>
            ))}

            {L.pills.map((p) => {
              const v = value(p.ref);
              const m = state[p.open];
              const real = isReal(v);
              const name = v === BYE ? '—' : v ? names.get(v) ?? '' : '';
              const text = name || (!hasPlayers && p.seed ? `Jugador ${p.seed}` : p.ph ?? '');
              const won = real && m.winner === v;
              const out = real && isReal(m.loser) && m.loser === v;
              const cls = ['pill', p.kind, real && 'real', won && 'won', out && 'out', p.h > 31 && 'tall', !text && 'blank'].filter(Boolean).join(' ');
              return (
                <div
                  key={p.key + (v ?? '')}
                  className={cls}
                  style={{ left: p.x, top: p.y, width: PW, height: p.h, animationDelay: intro ? `${((p.x / L.w) * 0.9).toFixed(2)}s` : undefined }}
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
            {showReset && (
              <button className="reset" style={{ left: L.reset.x, top: L.reset.y, width: L.reset.w, height: L.reset.h }} onClick={() => onOpen('GF2')}>
                Gran final · Reset
              </button>
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>
      {hint && <p className="hint">Arrastrá para moverte · rueda o pellizco para el zoom · tocá un jugador para ver su perfil</p>}
    </div>
  );
}
