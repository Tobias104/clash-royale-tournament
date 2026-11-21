const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { ...cors, 'Content-Type': 'application/json' } });

interface Card { name: string; iconUrls?: { medium?: string } }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { tag } = (await req.json()) as { tag?: unknown };
    if (typeof tag !== 'string' || !/^#?[0-9A-Za-z]{3,15}$/.test(tag.trim())) return json({ error: 'Tag inválido' });
    const clean = '#' + tag.trim().toUpperCase().replace(/^#/, '');
    const r = await fetch(`https://proxy.royaleapi.dev/v1/players/${encodeURIComponent(clean)}`, {
      headers: { Authorization: `Bearer ${Deno.env.get('CR_API_KEY')}` },
    });
    if (!r.ok) return json({ error: r.status === 404 ? 'Jugador no encontrado' : `Error de la API (${r.status})` });
    const p = await r.json();
    return json({
      name: p.name,
      tag: p.tag,
      expLevel: p.expLevel,
      trophies: p.trophies,
      bestTrophies: p.bestTrophies,
      wins: p.wins,
      losses: p.losses,
      battleCount: p.battleCount,
      threeCrownWins: p.threeCrownWins,
      arena: p.arena?.name ?? null,
      clan: p.clan ? { name: p.clan.name, tag: p.clan.tag } : null,
      pathOfLegend: p.currentPathOfLegendSeasonResult
        ? {
            league: p.currentPathOfLegendSeasonResult.leagueNumber,
            trophies: p.currentPathOfLegendSeasonResult.trophies,
            rank: p.currentPathOfLegendSeasonResult.rank,
          }
        : null,
      deck: ((p.currentDeck ?? []) as Card[]).map((c) => ({ name: c.name, icon: c.iconUrls?.medium ?? null })),
    });
  } catch (e) {
    return json({ error: (e as Error).message });
  }
});
