import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { sb } from './supabase';
import type { AdminState } from './hooks';
import type { Participant, Role, Tournament } from './types';

const TAG = /^#?[0-9A-Za-z]{3,15}$/;
const norm = (t: string) => '#' + t.trim().toUpperCase().replace(/^#/, '');
interface Row { name: string; tag: string; clan: string }
const blankRow = (): Row => ({ name: '', tag: '', clan: '' });
const ROLES: { v: Role; t: string }[] = [
  { v: 'admin', t: 'Administrador' },
  { v: 'organizer', t: 'Organizador' },
  { v: 'moderator', t: 'Moderador' },
];
const roleName = (r: string) => (r === 'owner' ? 'Dueño' : ROLES.find((x) => x.v === r)?.t ?? r);

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
      <h2>Ingresar</h2>
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
  participants: Participant[];
  reload: () => Promise<void>;
}

export default function Admin({ auth, t, participants, reload }: Props) {
  const size = t?.size ?? 8;
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: size }, blankRow));
  const [newName, setNewName] = useState('Torneo Clash Royale');
  const [newSize, setNewSize] = useState<8 | 16>(8);
  const [staff, setStaff] = useState<{ email: string; role: string }[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('admin');
  const [log, setLog] = useState<{ id: number; at: string; actor: string; action: string; table_name: string; row_key: string | null }[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setRows(Array.from({ length: size }, (_, i) => {
      const p = participants.find((q) => q.slot === i);
      return p ? { name: p.display_name, tag: p.player_tag, clan: p.clan_name ?? '' } : blankRow();
    }));
  }, [participants, size, t?.id]);

  async function loadStaff() {
    const { data } = await sb.from('staff').select('email,role').order('email');
    setStaff((data ?? []) as { email: string; role: string }[]);
  }
  async function loadLog() {
    const { data } = await sb.from('audit_log').select('id,at,actor,action,table_name,row_key').order('id', { ascending: false }).limit(40);
    setLog((data ?? []) as typeof log);
  }
  useEffect(() => {
    if (auth.isStaff) { void loadStaff(); void loadLog(); }
  }, [auth.isStaff]);

  if (!auth.ready) return <p className="page mut">Cargando…</p>;
  if (!auth.email) return <div className="page"><Login /></div>;
  if (!auth.isStaff) {
    return (
      <div className="page card">
        <h2>Sin permisos</h2>
        <p>La cuenta {auth.email} no integra el personal del torneo. Pedile al dueño que te agregue con ese correo.</p>
        <button onClick={() => void sb.auth.signOut()}>Salir</button>
      </div>
    );
  }

  const active = t && t.status !== 'finished' ? t : null;
  const draft = active?.status === 'draft';
  const live = active?.status === 'live';
  const setRow = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const fail = (m: string) => { setMsg(m); };

  async function createTournament() {
    const { error } = await sb.from('tournaments').insert({ name: newName.trim(), size: newSize });
    if (error) return fail(error.code === '23505' ? 'Ya hay un torneo activo: finalizalo o borrá el borrador.' : error.message);
    setMsg('Torneo creado. Cargá los jugadores.');
    await reload(); await loadLog();
  }

  async function saveParticipants() {
    if (!active) return;
    setMsg('');
    const upserts: { tournament_id: string; slot: number; display_name: string; player_tag: string; clan_name: string | null }[] = [];
    const seen = new Set<string>();
    const empties: number[] = [];
    for (let i = 0; i < size; i++) {
      const r = rows[i];
      if (!r.name.trim() && !r.tag.trim()) { empties.push(i); continue; }
      if (!r.name.trim() || !TAG.test(r.tag.trim())) return fail(`Jugador ${i + 1}: falta el nombre o el Player Tag no es válido.`);
      const tag = norm(r.tag);
      if (seen.has(tag)) return fail(`El Player Tag ${tag} está repetido.`);
      seen.add(tag);
      upserts.push({ tournament_id: active.id, slot: i, display_name: r.name.trim(), player_tag: tag, clan_name: r.clan.trim() || null });
    }
    if (draft) {
      for (const i of empties) {
        const { error } = await sb.from('participants').delete().eq('tournament_id', active.id).eq('slot', i);
        if (error) return fail(error.message);
      }
    } else if (empties.some((i) => participants.some((p) => p.slot === i))) {
      return fail('Con el torneo iniciado no se pueden quitar participantes.');
    }
    const toSave = live ? upserts.filter((u) => participants.some((p) => p.slot === u.slot)) : upserts;
    if (toSave.length) {
      const { error } = await sb.from('participants').upsert(toSave, { onConflict: 'tournament_id,slot' });
      if (error) return fail(error.code === '23505' ? 'Hay un Player Tag repetido en este torneo.' : error.message);
    }
    setMsg('Participantes guardados.');
    await reload(); await loadLog();
  }

  async function patchTournament(patch: Partial<Tournament>, ok: string) {
    if (!active) return;
    const { error } = await sb.from('tournaments').update(patch).eq('id', active.id);
    if (error) return fail(error.message);
    setMsg(ok);
    await reload(); await loadLog();
  }
  async function deleteDraft() {
    if (!active || !window.confirm('¿Borrar este borrador y sus participantes?')) return;
    const { error } = await sb.from('tournaments').delete().eq('id', active.id);
    if (error) return fail(error.message);
    setMsg('Borrador eliminado.');
    await reload(); await loadLog();
  }
  async function syncNow() {
    setMsg('Sincronizando…');
    const { data, error } = await sb.functions.invoke('sync');
    setMsg(error ? `Error: ${error.message}` : JSON.stringify(data));
    await reload();
  }

  async function addStaff(e: FormEvent) {
    e.preventDefault();
    const { error } = await sb.from('staff').insert({ email: newEmail.trim().toLowerCase(), role: newRole });
    if (error) return fail(error.message);
    setMsg('Agregado. Tiene que crear su cuenta con ese correo.');
    setNewEmail('');
    await loadStaff(); await loadLog();
  }
  async function changeRole(email: string, role: string) {
    const { error } = await sb.from('staff').update({ role }).eq('email', email);
    if (error) return fail(error.message);
    await loadStaff(); await loadLog();
  }
  async function removeStaff(email: string) {
    const { error } = await sb.from('staff').delete().eq('email', email);
    if (error) return fail(error.message);
    await loadStaff(); await loadLog();
  }

  return (
    <div className="page">
      <div className="row between">
        <h2>Panel del torneo</h2>
        <button className="ghost" onClick={() => void sb.auth.signOut()}>Salir ({auth.email} · {roleName(auth.role ?? '')})</button>
      </div>
      {msg && <p className="note">{msg}</p>}

      {!active && auth.canOrganize && (
        <section className="card">
          <h3>Nuevo torneo</h3>
          {t?.status === 'finished' && <p className="mut">El último torneo ({t.name}) terminó y queda guardado en el historial.</p>}
          <label>Nombre <input value={newName} onChange={(e) => setNewName(e.target.value)} /></label>
          <label>Cantidad de jugadores
            <select value={newSize} onChange={(e) => setNewSize(Number(e.target.value) === 16 ? 16 : 8)}>
              <option value={8}>8 jugadores</option>
              <option value={16}>16 jugadores</option>
            </select>
          </label>
          <button onClick={() => void createTournament()}>Crear torneo</button>
        </section>
      )}

      {active && (
        <section className="card">
          <h3>{active.name} · {draft ? 'Borrador' : 'En curso'} · {active.size} jugadores</h3>
          {draft && <p className="mut">Cargá los jugadores en orden: el lugar 1 juega contra el 2 (llave A), el 3 contra el 4, y así. Dejá una fila vacía para un pase libre.</p>}
          {live && <p className="mut">Torneo iniciado. Solo se pueden corregir nombre, tag y clan de los participantes (requiere ser administrador).</p>}
          {rows.map((r, i) => {
            const locked = live && !participants.some((p) => p.slot === i);
            return (
              <div className="team" key={i}>
                <b>{i + 1}</b>
                <input placeholder="Nombre visible" value={r.name} disabled={locked} onChange={(e) => setRow(i, 'name', e.target.value)} />
                <input placeholder="#TAG" value={r.tag} disabled={locked} onChange={(e) => setRow(i, 'tag', e.target.value)} />
                <input placeholder="Clan (opcional)" value={r.clan} disabled={locked} onChange={(e) => setRow(i, 'clan', e.target.value)} />
              </div>
            );
          })}
          <div className="row">
            {(draft ? auth.canOrganize : auth.canAdmin) && <button onClick={() => void saveParticipants()}>Guardar participantes</button>}
            {draft && auth.canOrganize && <button onClick={() => void patchTournament({ status: 'live' }, 'Torneo iniciado: se detectan batallas desde ahora.')}>Iniciar torneo</button>}
            {draft && auth.canOrganize && <button className="ghost" onClick={() => void deleteDraft()}>Borrar borrador</button>}
            {live && auth.canOrganize && (
              <button className="ghost" onClick={() => void patchTournament({ sync_enabled: !active.sync_enabled }, active.sync_enabled ? 'Detección automática pausada.' : 'Detección automática activada.')}>
                {active.sync_enabled ? 'Pausar detección' : 'Reanudar detección'}
              </button>
            )}
            {live && auth.canOrganize && <button className="ghost" onClick={() => void syncNow()}>Sincronizar ahora</button>}
          </div>
          {live && <p className="mut">Los resultados se cargan o se corrigen con un clic en el enfrentamiento del bracket.</p>}
        </section>
      )}

      {auth.isOwner && (
        <section className="card">
          <h3>Personal y roles</h3>
          <ul className="plain">
            {staff.map((s) => (
              <li key={s.email} className="row">
                <span>{s.email}</span>
                {s.role === 'owner' ? <em>Dueño</em> : (
                  <>
                    <select value={s.role} onChange={(e) => void changeRole(s.email, e.target.value)}>
                      {ROLES.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
                    </select>
                    <button className="ghost" onClick={() => void removeStaff(s.email)}>Quitar</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form className="row" onSubmit={(e) => void addStaff(e)}>
            <input type="email" required placeholder="correo@ejemplo.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
              {ROLES.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
            </select>
            <button type="submit">Agregar</button>
          </form>
        </section>
      )}

      <section className="card">
        <h3>Registro de cambios</h3>
        <div className="tblwrap">
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Tabla</th><th>Clave</th></tr></thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.at).toLocaleString()}</td><td>{l.actor}</td><td>{l.action}</td><td>{l.table_name}</td><td>{l.row_key ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
