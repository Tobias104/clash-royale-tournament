// Calcula la posición de cada pastilla y de cada conexión del bracket (8 o 16 jugadores),
// con el estilo de la primera página del PDF. Código puro: se prueba sin navegador.
import { buildBracket } from '../supabase/functions/_shared/engine.ts';
import type { MatchDef, Size, Src } from '../supabase/functions/_shared/engine.ts';

export const PW = 109;
export type PillKind = 'white' | 'red' | 'gold' | 'champ';
export interface PillL { key: string; ref: Src | 'champ'; x: number; y: number; w: number; h: number; kind: PillKind; open: string; seed?: number; ph?: string }
export interface EdgeL { d: string; from: string; match: string; arrow?: boolean; drop?: boolean }
export interface TextL { t: string; x: number; y: number; cls: string }
export interface Layout { w: number; h: number; pills: PillL[]; edges: EdgeL[]; texts: TextL[]; defs: MatchDef[]; reset: { x: number; y: number; w: number; h: number } }

export const refKey = (s: Src | 'champ'): string =>
  s === 'champ' ? 'champ' : 'slot' in s ? `slot:${s.slot}` : 'win' in s ? `win:${s.win}` : 'lose' in s ? `lose:${s.lose}` : `same:${s.same}:${s.side}`;

function parseRef(key: string): Src {
  const [t, v] = key.split(':');
  const id = v.replace('#2', '');
  return t === 'slot' ? { slot: Number(v) } : t === 'win' ? { win: id } : { lose: id };
}

const PARAMS = {
  3: { cw: 1456, mx: 82, pitch: 225, gap: 41, pitchY: 117, y0: 88.5, l1Gap: 40, l1Pitch: 0, drop: 118 },
  4: { cw: 2000, mx: 82, pitch: 176, gap: 41, pitchY: 90, y0: 88.5, l1Gap: 40, l1Pitch: 160, drop: 100 },
} as const;
const WH: Record<number, string> = { 8: 'Octavos de final', 4: 'Cuartos de final', 2: 'Semifinal' };
const n2 = (v: number) => Math.round(v * 100) / 100;
type Side = 'L' | 'R';
interface Pos { y: number; col: number; side: Side }

const cache = new Map<number, Layout>();
export function buildLayout(size: Size): Layout {
  const hit = cache.get(size);
  if (hit) return hit;
  const defs = buildBracket(size);
  const k = Math.log2(size) as 3 | 4;
  const P = PARAMS[k];
  const R = 2 * (k - 1); // rondas del bracket de perdedores
  const half = size / 2;
  const cx = P.cw / 2;
  const centerX = cx - PW / 2;
  const cnt: Record<string, number> = {};
  for (const d of defs) cnt[d.bracket + d.round] = (cnt[d.bracket + d.round] ?? 0) + 1;
  const xOf = (col: number, side: Side) => (side === 'L' ? P.mx + P.pitch * col : P.cw - P.mx - PW - P.pitch * col);

  // ---- Bracket principal
  const pos = new Map<string, Pos>();
  for (let n = 0; n < size; n++) {
    const s = n % half;
    pos.set(`slot:${n}`, { y: P.y0 + (s >> 1) * P.pitchY + (s & 1) * P.gap, col: 0, side: n < half ? 'L' : 'R' });
  }
  for (const d of defs) {
    if (d.bracket !== 'W' || d.round === k) continue;
    const a = pos.get(refKey(d.a))!;
    const b = pos.get(refKey(d.b))!;
    pos.set(`win:${d.id}`, { y: (a.y + b.y) / 2, col: d.round, side: d.index < cnt['W' + d.round] / 2 ? 'L' : 'R' });
  }
  const wFinal = `W${k}.1`;
  const lastL = `L${R}.1`;
  const yF = pos.get(`win:W${k - 1}.1`)!.y;

  // ---- Bloque central (Gran Final y Repechaje)
  const wfY = yF + 111;
  const cbp1Y = wfY + 81.5;
  const champY = (wfY + cbp1Y) / 2;
  const lfpY = cbp1Y + 21 + 118;
  const wlfY = lfpY + 61.5;
  const cbp2Y = (lfpY + wlfY) / 2;

  // ---- Bracket de perdedores (dos pasadas: la primera mide, la segunda ubica)
  const lbPass = (Y0: number) => {
    const m = new Map<string, Pos>();
    for (const d of defs) {
      if (d.bracket !== 'L' || d.round > R - 2) continue;
      const r = d.round;
      const per = cnt['L' + r] / 2;
      const side: Side = d.index < per ? 'L' : 'R';
      const j = d.index % per;
      if (r === 1) {
        m.set(refKey(d.a), { y: Y0 + j * P.l1Pitch, col: 0, side });
        m.set(refKey(d.b), { y: Y0 + j * P.l1Pitch + P.l1Gap, col: 0, side });
      } else {
        for (const [s, other] of [[d.a, d.b], [d.b, d.a]] as [Src, Src][]) {
          if ('lose' in s) m.set(refKey(s), { y: m.get(refKey(other))!.y - P.drop, col: r - 1, side });
        }
      }
      m.set(`win:${d.id}`, { y: (m.get(refKey(d.a))!.y + m.get(refKey(d.b))!.y) / 2, col: r, side });
    }
    return m;
  };
  const probe = lbPass(0).get(`win:L${R - 2}.1`)!;
  for (const [key, v] of lbPass(wlfY + 107 - probe.y)) pos.set(key, v);

  // ---- Pastillas
  const defOf = (key: string) => defs.find((d) => refKey(d.a) === key || refKey(d.b) === key);
  const pills: PillL[] = [];
  const labelOf = (id: string) => defs.find((d) => d.id === id)!.label;
  for (const [key, p] of pos) {
    const ref = parseRef(key);
    const red = 'lose' in ref;
    let ph: string | undefined;
    if (red) {
      const l = labelOf(ref.lose);
      ph = `Perdedor ${ref.lose.startsWith('W1.') ? l.charAt(0).toLowerCase() + l.slice(1) : l}`;
    }
    pills.push({ key, ref, x: n2(xOf(p.col, p.side)), y: n2(p.y - 15.5), w: PW, h: 31, kind: red ? 'red' : 'white', open: defOf(key)?.id ?? 'GF1', seed: 'slot' in ref ? ref.slot + 1 : undefined, ph });
  }
  const mk = (key: string, ref: Src | 'champ', x: number, yc: number, h: number, kind: PillKind, ph: string, open: string) =>
    pills.push({ key, ref, x: n2(x), y: n2(yc - h / 2), w: PW, h, kind, open, ph });
  mk(`win:${wFinal}`, { win: wFinal }, centerX, wfY, 31, 'gold', 'Ganador Final', 'GF1');
  mk(`win:${lastL}`, { win: lastL }, centerX, cbp1Y, 42, 'white', 'Campeón Bracket Perdedor', 'GF1');
  mk('champ', 'champ', centerX + 215, champY, 41, 'champ', 'Campeón del torneo', 'GF1');
  mk(`lose:${wFinal}`, { lose: wFinal }, centerX, lfpY, 42, 'red', 'Perdedor Final Bracket Principal', lastL);
  mk(`win:L${R - 1}.1`, { win: `L${R - 1}.1` }, centerX, wlfY, 31, 'white', '', lastL);
  mk(`win:${lastL}#2`, { win: lastL }, centerX + 215, cbp2Y, 41, 'white', 'Campeón Bracket Perdedor', 'GF1');

  // ---- Conexiones
  const byKey = new Map(pills.map((p) => [p.key, p]));
  const edges: EdgeL[] = [];
  const mid = (a: number, b: number) => (a + b) / 2;
  const hPath = (A: PillL, O: PillL, arrow: boolean) => {
    const right = O.x > A.x;
    const x1 = right ? A.x + PW : A.x;
    const x2 = right ? O.x : O.x + PW;
    const y1 = A.y + A.h / 2;
    const y2 = O.y + O.h / 2;
    return `M${n2(x1)} ${n2(y1)}H${n2(mid(x1, x2))}V${n2(y2)}${arrow ? `H${n2(x2)}` : ''}`;
  };
  for (const d of defs) {
    if (d.id === 'GF2') continue;
    const A = byKey.get(refKey(d.a));
    const B = byKey.get(refKey(d.b));
    const O = byKey.get(d.id === 'GF1' ? 'champ' : d.id === lastL ? `win:${d.id}#2` : `win:${d.id}`);
    if (!A || !B || !O) continue;
    for (const [Q, arrow] of [[A, true], [B, false]] as [PillL, boolean][]) {
      let path: string;
      if (d.id === wFinal) { // los finalistas bajan hasta "Ganador Final"
        const x = Q.x + PW / 2;
        const yb = Q.y + Q.h;
        path = `M${n2(x)} ${n2(yb)}V${n2(mid(yb, O.y))}H${n2(O.x + PW / 2)}${arrow ? `V${n2(O.y)}` : ''}`;
      } else if (d.id === `L${R - 1}.1`) { // los finalistas de perdedores suben hasta el centro
        const x = Q.x + PW / 2;
        path = `M${n2(x)} ${n2(Q.y)}V${n2(mid(Q.y, O.y + O.h))}H${n2(O.x + PW / 2)}${arrow ? `V${n2(O.y + O.h)}` : ''}`;
      } else path = hPath(Q, O, arrow);
      edges.push({ d: path, from: Q.key, match: d.id, arrow });
    }
  }
  if (k === 3) { // con 8 jugadores el perdedor de cada semifinal baja en línea recta, como en el PDF
    for (const d of defs.filter((x) => x.bracket === 'W' && x.round === k - 1)) {
      const B = byKey.get(refKey(d.b))!;
      const red = byKey.get(`lose:${d.id}`)!;
      edges.push({ d: `M${n2(B.x + PW / 2)} ${n2(B.y + B.h)}V${n2(red.y)}`, from: B.key, match: d.id, arrow: true, drop: true });
    }
  }

  // ---- Textos
  const maxBottom = Math.max(...pills.map((p) => p.y + p.h));
  const H = Math.ceil(maxBottom + 57);
  const texts: TextL[] = [
    { t: 'Bracket Principal', x: 82, y: 2, cls: 'ttl' },
    { t: 'Bracket Perdedores', x: 82, y: n2(lfpY - 21 - 29), cls: 'ttl' },
    { t: 'Final', x: cx, y: 38, cls: 'hd ctr' },
    { t: 'Final', x: cx, y: H - 40, cls: 'hd ctr' },
    { t: 'GRAN FINAL', x: n2(centerX - 148), y: n2(champY - 15), cls: 'mid big' },
    { t: 'REPECHAJE', x: n2(centerX - 118), y: n2(cbp2Y - 12), cls: 'mid' },
  ];
  for (let c = 0; c <= k - 2; c++) for (const s of ['L', 'R'] as Side[]) texts.push({ t: WH[size >> (c + 1)], x: n2(xOf(c, s) + PW / 2), y: 38, cls: 'hd ctr' });
  for (let c = 0; c <= R - 3; c++) for (const s of ['L', 'R'] as Side[]) texts.push({ t: k === 3 ? ['Cuartos de final', 'Semifinal'][c] : `Ronda ${c + 1}`, x: n2(xOf(c, s) + PW / 2), y: H - 40, cls: 'hd ctr' });
  for (const d of defs.filter((x) => x.bracket === 'W' && x.round === 1)) {
    const a = pos.get(refKey(d.a))!;
    const b = pos.get(refKey(d.b))!;
    const left = d.index < half / 2;
    texts.push({ t: d.label, x: left ? P.mx - 50 : n2(xOf(0, 'R') + PW + 17), y: n2(mid(a.y, b.y) - 7), cls: 'llave' });
  }

  const out: Layout = { w: P.cw, h: H, pills, edges, texts, defs, reset: { x: n2(centerX + 215), y: n2(champY + 20.5 + 10), w: PW, h: 24 } };
  cache.set(size, out);
  return out;
}
