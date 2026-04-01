/**
 * RespawnMN — Steam API Cloudflare Worker
 * Secrets: STEAM_API_KEY, GEMINI_API_KEY
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://respawnmn.site',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

const STEAM_BASE = 'https://api.steampowered.com'
const STORE_BASE = 'https://store.steampowered.com'

// In-memory cache (persists within isolate, ~30min TTL)
let newsCache = null
let newsCacheTime = 0
const NEWS_TTL = 30 * 60 * 1000

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    try {
      // === No Steam API key needed ===

      if (action === 'deals') {
        const res = await fetch(`${STORE_BASE}/api/featuredcategories/?l=english&cc=US`)
        const data = await res.json()

        function mapItem(g) {
          return {
            appid: g.id,
            name: g.name,
            discountPct: g.discount_percent || 0,
            originalPrice: g.original_price || 0,
            finalPrice: g.final_price || 0,
            image: g.large_capsule_image || g.header_image || '',
          }
        }

        return json({
          specials: (data.specials?.items || []).filter(g => g.discount_percent > 0).map(mapItem),
          topSellers: (data.top_sellers?.items || []).map(mapItem),
          newReleases: (data.new_releases?.items || []).map(mapItem),
        })
      }

      if (action === 'steamnews') {
        // Return cached if fresh
        if (newsCache && Date.now() - newsCacheTime < NEWS_TTL) {
          return json(newsCache)
        }

        // Fetch Steam RSS feed
        const rssRes = await fetch(`${STORE_BASE}/feeds/news/`, {
          headers: { 'User-Agent': 'RespawnMN/1.0' },
        })
        const xml = await rssRes.text()
        let items = parseRSS(xml).slice(0, 8)

        // Fallback: if RSS empty, try popular game news via API
        if (items.length === 0) {
          items = await fetchGameNews(env.STEAM_API_KEY)
        }

        // Translate via Gemini
        const geminiKey = env.GEMINI_API_KEY
        if (geminiKey && items.length) {
          try {
            const titles = items.map(i => i.title)
            const descs = items.map(i => (i.description || '').slice(0, 120))
            const translated = await geminiTranslate(titles, descs, geminiKey)
            items.forEach((item, i) => {
              item.titleMn = translated.titles[i] || item.title
              item.descMn = translated.descs[i] || item.description
            })
          } catch (e) {
            items.forEach(item => {
              item.titleMn = item.title
              item.descMn = item.description
            })
          }
        }

        const result = { news: items }
        newsCache = result
        newsCacheTime = Date.now()
        return json(result)
      }

      // === Steam API key required ===
      const key = env.STEAM_API_KEY
      if (!key) return json({ error: 'Steam API key тохируулагдаагүй' }, 500)

      if (action === 'resolve') {
        const vanity = url.searchParams.get('vanity')
        if (!vanity) return json({ error: 'vanity parameter шаардлагатай' }, 400)

        const res = await fetch(
          `${STEAM_BASE}/ISteamUser/ResolveVanityURL/v0001/?key=${key}&vanityurl=${encodeURIComponent(vanity)}`
        )
        const data = await res.json()
        return json(data.response)

      } else if (action === 'profile') {
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
        const steamid = url.searchParams.get('steamid')
        if (!steamid) return json({ error: 'steamid parameter шаардлагатай' }, 400)

        const res = await fetch(
          `${STEAM_BASE}/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1`
        )
        const data = await res.json()
        const games = data.response?.games || []

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
          totalHours: Math.round(games.reduce((s, g) => s + (g.playtime_forever || 0), 0) / 60),
          games: sorted,
        })

      } else if (action === 'recent') {
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

      } else if (action === 'comingsoon') {
        const res = await fetch(`${STORE_BASE}/api/featuredcategories/?l=english&cc=US`)
        const data = await res.json()
        const items = data.coming_soon?.items || []
        const games = items.slice(0, 20).map(g => ({
          appid: g.id,
          name: g.name,
          releaseDate: g.release_date_stamp
            ? new Date(g.release_date_stamp * 1000).toISOString().split('T')[0]
            : '',
          releaseDateStr: g.release_date || '',
          image: g.large_capsule_image || g.header_image || '',
          price: g.final_price || 0,
        }))
        return json({ games })

      } else if (action === 'topgames') {
        const chartsRes = await fetch('https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/', {
          headers: { 'User-Agent': 'RespawnMN/1.0' },
        })
        const chartsData = await chartsRes.json()
        const ranks = (chartsData.response?.ranks || []).slice(0, 20)

        let nameMap = {}
        try {
          const nameResults = await Promise.all(
            ranks.map(r =>
              fetch(`${STORE_BASE}/api/appdetails?appids=${r.appid}&filters=basic`, {
                headers: { 'User-Agent': 'RespawnMN/1.0' },
              })
                .then(res => res.json())
                .then(d => [String(r.appid), d[r.appid]?.data?.name || ''])
                .catch(() => [String(r.appid), ''])
            )
          )
          nameMap = Object.fromEntries(nameResults)
        } catch (_) {}

        const games = ranks.map(r => ({
          appid: r.appid,
          name: nameMap[r.appid] || `App ${r.appid}`,
          peakPlayers: r.peak_in_game || 0,
          lastWeekRank: r.last_week_rank || 0,
          image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${r.appid}/header.jpg`,
        }))
        return json({ games, updated: new Date().toISOString() })

      } else if (action === 'pricehistory') {
        const appid = url.searchParams.get('appid')
        if (!appid) return json({ error: 'appid шаардлагатай' }, 400)

        const itadKey = env.ITAD_API_KEY
        if (!itadKey) return json({ error: 'ITAD_API_KEY тохируулагдаагүй' }, 503)

        // Look up game ID by Steam appid
        const lookupRes = await fetch(
          `https://api.isthereanydeal.com/games/lookup/v1?key=${itadKey}&appids=app/${appid}`
        )
        const lookupData = await lookupRes.json()
        const gameId = lookupData.games?.[`app/${appid}`]?.id
        if (!gameId) return json({ error: 'Тоглоом олдсонгүй' }, 404)

        // Get price history on Steam
        const histRes = await fetch(
          `https://api.isthereanydeal.com/games/history/v2?key=${itadKey}&id=${gameId}&shops=steam`
        )
        const histData = await histRes.json()
        const steamHistory = Array.isArray(histData)
          ? histData.find(s => s.shop?.id === 'steam')
          : null

        const points = (steamHistory?.price || []).map(h => ({
          date: new Date(h.timestamp * 1000).toISOString().split('T')[0],
          price: h.deal?.price?.amount ?? 0,
          regular: h.deal?.regular?.amount ?? 0,
        }))

        // Current price from Steam store
        const storeRes = await fetch(
          `${STORE_BASE}/api/appdetails?appids=${appid}&cc=US&filters=price_overview`
        )
        const storeData = await storeRes.json()
        const po = storeData[appid]?.data?.price_overview

        return json({
          current: po ? { final: po.final_formatted, discount: po.discount_percent } : null,
          history: points,
        })

      } else if (action === 'gamedetail') {
        const appid = url.searchParams.get('appid')
        if (!appid) return json({ error: 'appid шаардлагатай' }, 400)
        const res = await fetch(`${STORE_BASE}/api/appdetails?appids=${appid}&l=english`)
        const data = await res.json()
        const d = data[appid]?.data
        if (!d) return json({ error: 'Тоглоом олдсонгүй' }, 404)
        return json({
          appid: d.steam_appid,
          name: d.name,
          description: d.short_description || '',
          genres: (d.genres || []).map(g => g.description),
          developers: d.developers || [],
          releaseDate: d.release_date?.date || '',
          isFree: d.is_free,
          price: d.price_overview?.final_formatted || '',
          headerImage: d.header_image || '',
          metacritic: d.metacritic?.score || null,
        })

      } else {
        return json({ error: 'action parameter буруу. deals | steamnews | comingsoon | topgames | pricehistory | gamedetail | resolve | profile | games | recent' }, 400)
      }

    } catch (err) {
      return json({ error: 'Server алдаа: ' + err.message }, 500)
    }
  }
}

// ─── RSS parsing ───

function parseRSS(xml) {
  const items = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const c = match[1]
    const title = extractTag(c, 'title')
    const link = extractTag(c, 'link') || extractLink(c)
    const rawDesc = decodeEntities(extractTag(c, 'description'))
    const desc = stripHtml(rawDesc).slice(0, 200)
    const date = extractTag(c, 'pubDate')
    const image = extractImage(c) || extractImage(rawDesc)
    if (title) items.push({ title, link, description: desc, date, image })
  }
  return items
}

function extractTag(xml, tag) {
  const cdataMatch = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))
  if (cdataMatch) return cdataMatch[1].trim()
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  return match ? match[1].trim() : ''
}

function extractLink(xml) {
  const match = xml.match(/<link[^>]*>([^<]+)/)
  return match ? match[1].trim() : ''
}

function extractImage(xml) {
  const enc = xml.match(/<enclosure[^>]+url="([^"]+)"/)
  if (enc) return enc[1]
  const media = xml.match(/<media:content[^>]+url="([^"]+)"/)
  if (media) return media[1]
  const thumb = xml.match(/<media:thumbnail[^>]+url="([^"]+)"/)
  if (thumb) return thumb[1]
  const img = xml.match(/<img[^>]+src="([^"]+)"/)
  if (img) return img[1]
  return ''
}

function decodeEntities(text) {
  if (!text) return ''
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
}

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ─── Fallback: fetch news from popular games via Steam API ───

async function fetchGameNews(apiKey) {
  const apps = [730, 570, 578080, 252490, 440, 1086940]
  const results = []

  const fetches = apps.map(appid =>
    fetch(`${STEAM_BASE}/ISteamNews/GetNewsForApp/v0002/?appid=${appid}&count=2&maxlength=200&format=json`)
      .then(r => r.json())
      .catch(() => null)
  )

  const all = await Promise.all(fetches)
  for (const data of all) {
    const newsItems = data?.appnews?.newsitems || []
    for (const n of newsItems) {
      results.push({
        title: n.title,
        link: n.url,
        description: stripHtml(n.contents || '').slice(0, 200),
        date: n.date ? new Date(n.date * 1000).toUTCString() : '',
        image: '',
      })
    }
  }

  return results.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8)
}

// ─── Gemini translation ───

async function geminiTranslate(titles, descs, apiKey) {
  const prompt = `Чи тоглоомын мэдээний орчуулагч. Дараах гарчиг болон тайлбаруудыг Монгол хэл рүү орчуул. JSON форматаар хариулна уу:

Гарчгууд:
${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Тайлбарууд:
${descs.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Зөвхөн JSON хариулна уу, ямар нэг тайлбар нэмэхгүй:
{"titles": ["орчуулга1", "орчуулга2", ...], "descs": ["орчуулга1", "орчуулга2", ...]}`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    }
  )

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  // Extract JSON from response (might have markdown code fences)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0])
  }

  return { titles: [], descs: [] }
}

// ─── Helpers ───

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS })
}

function getStatus(state) {
  const map = { 0: 'Offline', 1: 'Online', 2: 'Busy', 3: 'Away', 4: 'Snooze', 5: 'Looking to trade', 6: 'Looking to play' }
  return map[state] || 'Unknown'
}
