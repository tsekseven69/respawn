#!/usr/bin/env node
/**
 * RespawnMN — Автомат мэдээ татагч
 * IGN / GameSpot RSS → Gemini орчуулга → Jekyll пост
 */

import { writeFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import Parser from 'rss-parser'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) {
  console.error('❌  GEMINI_API_KEY тохируулагдаагүй')
  process.exit(1)
}

const RSS_SOURCES = [
  { url: 'https://feeds.ign.com/ign/all',            category: 'Мэдээ',   badge: 'badge-blue'   },
  { url: 'https://www.gamespot.com/feeds/news/',      category: 'Мэдээ',   badge: 'badge-green'  },
  { url: 'https://www.pcgamer.com/rss/',              category: 'Мэдээ',   badge: 'badge-purple' },
]

const MAX_PER_SOURCE = 2  // өдөрт эх сурвалж тус бүрээс хэдэн нийтлэл авах

// --- Helpers ---
function buildSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
}

function getExistingPosts() {
  const postsDir = resolve(ROOT, '_posts')
  if (!existsSync(postsDir)) return new Set()
  return new Set(
    readdirSync(postsDir).map(f => f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', ''))
  )
}

// --- Gemini орчуулга ---
async function translateWithGemini(title, body) {
  const prompt = `Та Монголын gaming сайт RespawnMN-д зориулсан мэргэжлийн gaming сэтгүүлч. Дараах англи мэдээг Монгол хэл рүү орчуул.

Дүрэм:
- Монгол геймерүүдэд ойлгомжтой, амьд яриа хэлбэрээр орчуул
- Gaming нэр томьёог (ranked, meta, DLC, patch, FPS, RPG, battle royale гэх мэт) англиараа үлдээ
- Тоглоомын нэрийг орчуулахгүй
- Агуулгыг 200-400 үгт багтаа
- Зөвхөн JSON форматаар буцаа:

{"title": "Монгол гарчиг", "body": "Монгол агуулга markdown форматаар"}

Англи гарчиг: ${title}

Англи агуулга:
${body}`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
      })
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API алдаа ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) throw new Error('Gemini хоосон хариу буцаасан')

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('JSON формат буруу')

  return JSON.parse(jsonMatch[0])
}

// --- Jekyll пост бичих ---
function writePost(translated, { slug, date, category, badge, sourceUrl }) {
  const thumbOptions = ['a', 'b', 'c', 'd', 'e', 'f']
  const thumb = thumbOptions[Math.floor(Math.random() * thumbOptions.length)]
  const time = `${date} 08:00:00 +0800`
  const excerpt = translated.body.split('\n\n')[0].replace(/[#*_"]/g, '').trim().slice(0, 120)

  const content = `---
title: "${translated.title.replace(/"/g, "'")}"
date: ${time}
category: ${category}
badge: ${badge}
thumb: ${thumb}
featured: false
translated: true
source_url: "${sourceUrl}"
excerpt: "${excerpt}"
---

${translated.body}`

  const filename = `${date}-${slug}.md`
  writeFileSync(resolve(ROOT, '_posts', filename), content, 'utf8')
  return filename
}

// --- Main ---
async function main() {
  const parser = new Parser()
  const existingSlugs = getExistingPosts()
  const newPosts = []

  for (const source of RSS_SOURCES) {
    console.log(`\n📡  RSS татаж байна: ${source.url}`)

    let feed
    try {
      feed = await parser.parseURL(source.url)
    } catch (err) {
      console.error(`❌  RSS алдаа: ${err.message}`)
      continue
    }

    let count = 0
    for (const item of feed.items) {
      if (count >= MAX_PER_SOURCE) break

      const slug = buildSlug(item.title || '')
      if (!slug || existingSlugs.has(slug)) continue

      const body = item.contentSnippet || item.content || item.summary || item.description || ''
      if (!body || body.length < 80) continue

      const today = new Date().toISOString().split('T')[0]

      console.log(`🤖  Орчуулж байна: ${item.title}`)
      try {
        const translated = await translateWithGemini(item.title, body)
        const filename = writePost(translated, {
          slug,
          date: today,
          category: source.category,
          badge: source.badge,
          sourceUrl: item.link || ''
        })
        newPosts.push(filename)
        existingSlugs.add(slug)
        count++
        await new Promise(r => setTimeout(r, 1500)) // rate limit
      } catch (err) {
        console.error(`❌  Орчуулахад алдаа: ${err.message}`)
      }
    }
  }

  if (newPosts.length === 0) {
    console.log('\n📭  Шинэ пост байхгүй.')
  } else {
    console.log(`\n✅  ${newPosts.length} шинэ пост:`)
    newPosts.forEach(f => console.log(`   📄  ${f}`))
  }
}

main()
