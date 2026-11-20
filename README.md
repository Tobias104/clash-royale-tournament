# Torneo Clash Royale en vivo

Bracket de doble eliminación (principal, perdedores, repechaje y gran final) con zoom, perfiles de jugadores y detección automática de resultados vía RoyaleAPI.

**Stack 100 % gratis:** React + TypeScript + Vite (GitHub Pages) · Supabase (base de datos, login, tiempo real, Edge Functions, cron).

## 1. Supabase
1. Creá un proyecto en https://supabase.com (plan Free).
2. En **SQL Editor** pegá `supabase/schema.sql`. Antes, cambiá `tu_correo@ejemplo.com` por tu correo (serás el dueño).
3. En **Authentication → Providers → Email** dejá activada la confirmación de correo.

## 2. Clave de la API de Clash Royale
1. En https://developer.clashroyale.com creá una clave y en las IP permitidas poné **`45.79.218.79`** (proxy de RoyaleAPI, así no necesitás IP fija).
2. Instalá la CLI de Supabase y, en la carpeta del repo:
```bash
supabase login
supabase link --project-ref TU_REF
supabase secrets set CR_API_KEY=tu_clave CRON_SECRET=una_frase_larga_al_azar
supabase functions deploy sync --no-verify-jwt
supabase functions deploy player --no-verify-jwt
```
3. Editá `supabase/cron.sql` (TU_REF y TU_CRON_SECRET) y ejecutalo en el SQL Editor: sincroniza cada minuto.

## 3. Probar en tu PC
```bash
cp .env.example .env     # completá URL y anon key (Settings → API)
npm install
npm run dev
```

## 4. Publicar en GitHub Pages
1. Repo → **Settings → Pages → Source: GitHub Actions**.
2. Repo → **Settings → Secrets and variables → Actions** → creá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Subí el código a `main`: el workflow `.github/workflows/deploy.yml` compila y publica en `https://tobias104.github.io/clash-royale-tournament/`.

## Uso
- Entrá a `/#admin`, creá tu cuenta con el correo del dueño y confirmá el correo.
- Cargá los 8 jugadores (puestos 1–2 = llave A, 3–4 = B, 5–6 = C, 7–8 = D; fila vacía = pase libre), elegí el formato y tocá **Iniciar torneo**.
- Los jugadores se enfrentan en batallas amistosas 1v1 dentro de cada llave: la función detecta las batallas posteriores al inicio, cuenta victorias y avanza el bracket en vivo.
- Para corregir algo, hacé clic en la llave → **Corregir resultado**. El dueño agrega otros administradores desde el panel (deben crear su cuenta con ese correo).

## Límites del plan gratis
Supabase Free pausa el proyecto tras 7 días sin actividad; el cron cada minuto suele evitarlo, pero si el torneo termina conviene detenerlo (`select cron.unschedule('sync-torneo');`).
