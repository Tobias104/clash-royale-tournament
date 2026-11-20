import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { sb } from './supabase';
import type { AdminState } from './hooks';
import type { Team, Tournament } from './types';

const TAG = /^#?[0-9A-Za-z]{3,15}$/;
const norm = (t: string) => '#' + t.trim().toUpperCase().replace(/^#/, '');
interface Row { p1_name: string; p1_tag: string; p2_name: string; p2_tag: string }
const blankRow = (): Row => ({ p1_name: '', p1_tag: '', p2_name: '', p2_tag: '' });

function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');

  async function go(kind: 'in' | 'up', e?: FormEvent) {
    e?.preventDefault();
    const { error } =
      kind === 'in'
        ? await sb.auth.signInWithPassword({ email: email.trim(), password: pw })
        : await sb.auth.signUp({ email: email.trim(), password: pw });
    setMsg(error ? error.message : kind === 'up' ? 'Cuenta creada. Confirmá tu correo y después ingresá.' : '');
  }

  return (
    <form className="card" onSubmit={(e) => void go('in', e)}>
      <h2>Ingresar como administrador</h2>
      <label>Correo <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Contraseña <input type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <div className="row">
        <button type="submit">Ingresar</button>
        <button type="button" className="ghost" onClick={() => void go('up')}>Crear cuenta</button>
      </div>
      {msg && <p className="mut">{msg}</p>}
    </form>
  );
}

interface Props {
  auth: AdminState;
  t: Tournament | null;
  teams: Team[];
  reload: () => Promise<void>;
}

export default function Admin({ auth, t, teams, reload }: Props) {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 8 }, blankRow));
  const [name, setName] = useState('');
  const [bestOf, setBestOf] = useState(3);
  const [admins, setAdmins] = useState<{ email: string; is_owner: boolean }[]>([]);
  const [newAdmin, setNewAdmin] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setRows(Array.from({ length: 8 }, (_, i) => {
      const x = teams.find((q) => q.seed === i + 1);
      return x ? { p1_name: x.p1_name, p1_tag: x.p1_tag, p2_name: x.p2_name ?? '', p2_tag: x.p2_tag ?? '' } : blankRow();
    }));
  }, [teams]);
  useEffect(() => {
    if (t) { setName(t.name); setBestOf(t.best_of); }
  }, [t]);

  async function loadAdmins() {
    const { data } = await sb.from('admins').select('email,is_owner').order('email');
    setAdmins((data ?? []) as { email: string; is_owner: boolean }[]);
  }
  useEffect(() => {
    if (auth.isAdmin) void loadAdmins();
  }, [auth.isAdmin]);

  if (!auth.ready) return <p className="page mut">Cargando…</p>;
  if (!auth.email) return <div className="page"><Login /></div>;
  if (!auth.isAdmin) {
    return (
      <div className="page card">
        <h2>Sin permisos</h2>
        <p>La cuenta {auth.email} no es administradora. Pedile al dueño que te agregue.</p>
        <button onClick={() => void sb.auth.signOut()}>Salir</button>
      </div>
    );
  }

  const setRow = (i: number, k: keyof Row, v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function saveTeams() {
    setMsg('');
    for (let i = 0; i < 8; i++) {
      const r = rows[i];
      const empty = !r.p1_name.trim() && !r.p1_tag.trim();
      if (empty) {
        const { error } = await sb.from('teams').delete().eq('seed', i + 1);
        if (error) return setMsg(error.message);
        continue;
      }
      if (!r.p1_name.trim() || !TAG.test(r.p1_tag.trim())) return setMsg(`Jugador ${i + 1}: falta el nombre o el tag no es válido.`);
      const { error } = await sb.from('teams').upsert(
        { seed: i + 1, p1_name: r.p1_name.trim(), p1_tag: norm(r.p1_tag), p2_name: null, p2_tag: null },
        { onConflict: 'seed' },
      );
      if (error) return setMsg(error.message);
    }
    await reload();
    setMsg('Jugadores guardados.');
  }

  async function updateTournament(patch: Partial<Tournament>, ok: string) {
    const { error } = await sb.from('tournament').update(patch).eq('id', 1);
    setMsg(error ? error.message : ok);
    if (!error) await reload();
  }

  async function syncNow() {
    setMsg('Sincronizando…');
    const { data, error } = await sb.functions.invoke('sync');
    setMsg(error ? `Error: ${error.message}` : JSON.stringify(data));
  }

  async function addAdmin(e: FormEvent) {
    e.preventDefault();
    const { error } = await sb.from('admins').insert({ email: newAdmin.trim().toLowerCase(), is_owner: false });
    setMsg(error ? error.message : 'Administrador agregado. Tiene que crear su cuenta con ese correo.');
    if (!error) { setNewAdmin(''); await loadAdmins(); }
  }
  async function removeAdmin(email: string) {
    const { error } = await sb.from('admins').delete().eq('email', email);
    setMsg(error ? error.message : 'Administrador quitado.');
    if (!error) await loadAdmins();
  }

  return (
    <div className="page">
      <div className="row between">
        <h2>Panel de administración</h2>
        <button className="ghost" onClick={() => void sb.auth.signOut()}>Salir ({auth.email})</button>
      </div>
      {msg && <p className="note">{msg}</p>}

      <section className="card">
        <h3>Torneo</h3>
        <label>Nombre <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Formato de cada partido
          <select value={bestOf} onChange={(e) => setBestOf(Number(e.target.value))}>
            <option value={1}>Una batalla</option>
            <option value={3}>Al mejor de 3</option>
            <option value={5}>Al mejor de 5</option>
          </select>
        </label>
        <div className="row">
          <button onClick={() => void updateTournament({ name: name.trim() || 'Torneo Clash Royale', best_of: bestOf }, 'Torneo actualizado.')}>Guardar</button>
          {t?.started_at
            ? <button className="ghost" onClick={() => void updateTournament({ started_at: null }, 'Detección automática pausada.')}>Pausar detección</button>
            : <button onClick={() => void updateTournament({ started_at: new Date().toISOString() }, 'Torneo iniciado: se detectan batallas desde ahora.')}>Iniciar torneo</button>}
          <button className="ghost" onClick={() => void syncNow()}>Sincronizar ahora</button>
        </div>
        <p className="mut">{t?.started_at ? `Iniciado el ${new Date(t.started_at).toLocaleString()}. Solo cuentan batallas posteriores.` : 'Sin iniciar: la API no registra resultados.'}</p>
      </section>

      <section className="card">
        <h3>Jugadores (en orden de llaves)</h3>
        <p className="mut">Los puestos 1 y 2 juegan la llave A, 3 y 4 la B, 5 y 6 la C, 7 y 8 la D. Dejá una fila vacía para un pase libre.</p>
        {rows.map((r, i) => (
          <div className="team" key={i}>
            <b>{i + 1}</b>
            <input placeholder="Nombre" value={r.p1_name} onChange={(e) => setRow(i, 'p1_name', e.target.value)} />
            <input placeholder="#TAG" value={r.p1_tag} onChange={(e) => setRow(i, 'p1_tag', e.target.value)} />
          </div>
        ))}
        <button onClick={() => void saveTeams()}>Guardar equipos</button>
        <p className="mut">Los resultados manuales se cargan haciendo clic en cualquier llave del bracket.</p>
      </section>

      {auth.isOwner && (
        <section className="card">
          <h3>Administradores</h3>
          <ul>
            {admins.map((a) => (
              <li key={a.email}>
                {a.email} {a.is_owner ? '(dueño)' : <button className="ghost" onClick={() => void removeAdmin(a.email)}>Quitar</button>}
              </li>
            ))}
          </ul>
          <form className="row" onSubmit={(e) => void addAdmin(e)}>
            <input type="email" required placeholder="correo@ejemplo.com" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} />
            <button type="submit">Agregar administrador</button>
          </form>
        </section>
      )}
    </div>
  );
}
