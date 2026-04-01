/**
 * RespawnMN — Steam API Cloudflare Worker
 * Deploy: https://workers.cloudflare.com
 * Secret: STEAM_API_KEY (wrangler secret put STEAM_API_KEY)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://respawnmn.site',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

const STEAM_BASE = 'https://api.steampowered.com'

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')
    const key = env.STEAM_API_KEY

    if (!key) {
      return json({ error: 'Steam API key тохируулагдаагүй' }, 500)
    }

    try {
      if (action === 'resolve') {
        // Vanity URL → Steam ID
        const vanity = url.searchParams.get('vanity')
        if (!vanity) return json({ error: 'vanity parameter шаардлагатай' }, 400)

        const res = await fetch(
          `${STEAM_BASE}/ISteamUser/ResolveVanityURL/v0001/?key=${key}&vanityurl=${encodeURIComponent(vanity)}`
        )
        const data = await res.json()
        return json(data.response)

      } else if (action === 'profile') {
        // Steam ID → Profile info
        const steamid = url.searchParams.get('steamid')
        if (!steamid) return json({ error: 'steamid parameter шаардлагатай' }, 400)

        const [summaryRes, levelRes] = await Promise.all([
          fetch(`${STEAM_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steamid}`),
          fetch(`${STEAM_BASE}/IPlayerService/GetSteamLevel/v1/?key=${key}&steamid=${steamid}`)
        ])

        const [summaryData, levelData] = await Promise.all([
          summaryRes.json(),
          levelRes.json()
        ])

        const player = summaryData.response?.players?.[0]
        if (!player) return json({ error: 'Тоглогч олдсонгүй' }, 404)

        return json({
          steamid: player.steamid,
          name: player.personaname,
          avatar: player.avatarfull,
          profileUrl: player.profileurl,
          status: getStatus(player.personastate),
          level: levelData.response?.player_level || 0,
          country: player.loccountrycode || null,
          created: player.timecreated || null,
        })

      } else if (action === 'games') {
        // Owned games + hours
        const steamid = url.searchParams.get('steamid')
        if (!steamid) return json({ error: 'steamid parameter шаардлагатай' }, 400)

        const res = await fetch(
          `${STEAM_BASE}/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1`
        )
        const data = await res.json()
        const games = data.response?.games || []

        // Sort by most played, top 10
        const sorted = games
          .sort((a, b) => b.playtime_forever - a.playtime_forever)
          .slice(0, 10)
          .map(g => ({
            appid: g.appid,
            name: g.name,
            hours: Math.round(g.playtime_forever / 60),
            img: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`,
            lastPlayed: g.rtime_last_played || null,
          }))

        return json({
          total: games.length,
          totalHours: Math.round(games.reduce((s, g) => s + g.playtime_forever, 0) / 60),
          games: sorted,
        })

      } else if (action === 'recent') {
        // Recently played games (2 weeks)
        const steamid = url.searchParams.get('steamid')
        if (!steamid) return json({ error: 'steamid parameter шаардлагатай' }, 400)

        const res = await fetch(
          `${STEAM_BASE}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${key}&steamid=${steamid}&count=5`
        )
        const data = await res.json()
        const games = data.response?.games || []

        return json({
          games: games.map(g => ({
            appid: g.appid,
            name: g.name,
            hours2weeks: Math.round(g.playtime_2weeks / 60 * 10) / 10,
            hoursTotal: Math.round(g.playtime_forever / 60),
            img: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`,
          }))
        })

      } else {
        return json({ error: 'action parameter буруу. resolve | profile | games | recent' }, 400)
      }

    } catch (err) {
      return json({ error: 'Server алдаа: ' + err.message }, 500)
    }
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS })
}

function getStatus(state) {
  const map = { 0: 'Offline', 1: 'Online', 2: 'Busy', 3: 'Away', 4: 'Snooze', 5: 'Looking to trade', 6: 'Looking to play' }
  return map[state] || 'Unknown'
}
