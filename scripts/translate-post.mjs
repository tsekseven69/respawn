#!/usr/bin/env node
/**
 * RespawnMN — Мэдээ орчуулагч
 *
 * Хэрэглээ:
 *   ANTHROPIC_API_KEY=sk-... node scripts/translate-post.mjs \
 *     --title "Elden Ring Gets New DLC" \
 *     --body "Full English article text..." \
 *     --category "Мэдээ" \
 *     --badge "badge-blue"
 *
 *   Файлаас унших:
 *     node scripts/translate-post.mjs --title "..." --file article.txt
 */

import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// --- Parse CLI args ---
function parseArgs() {
  const args = process.argv.slice(2)
  const result = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      result[key] = args[i + 1] ?? true
      i++
    }
  }
  return result
}

const args = parseArgs()

// --from-env: read inputs from environment variables (used by GitHub Actions)
if (args['from-env']) {
  args.title = process.env.POST_TITLE
  args.category = process.env.POST_CATEGORY || 'Мэдээ'
  args.badge = process.env.POST_BADGE || 'badge-blue'
  args.featured = process.env.POST_FEATURED === 'true' ? 'true' : 'false'
  args.date = process.env.POST_DATE || ''
}

if (!args.title) {
  console.error('❌  --title шаардлагатай')
  process.exit(1)
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌  ANTHROPIC_API_KEY environment variable тохируулагдаагүй байна')
  process.exit(1)
}

// Body from --body, --file, env base64, or env plain
let englishBody = args.body ?? ''

if (!englishBody && process.env.POST_BODY_B64) {
  englishBody = Buffer.from(process.env.POST_BODY_B64, 'base64').toString('utf8')
} else if (!englishBody && process.env.POST_BODY) {
  englishBody = process.env.POST_BODY
}

if (!englishBody && args.file) {
  const filePath = resolve(process.cwd(), args.file)
  if (!existsSync(filePath)) {
    console.error(`❌  Файл олдсонгүй: ${filePath}`)
    process.exit(1)
  }
  englishBody = readFileSync(filePath, 'utf8')
}

if (!englishBody) {
  console.error('❌  --body, --file, эсвэл POST_BODY_B64 env шаардлагатай')
  process.exit(1)
}

// --- Translate with Claude ---
const client = new Anthropic()

async function translate(title, body) {
  console.log('🤖  Claude-аар орчуулж байна...')

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Та Монголын gaming сайт RespawnMN-д зориулсан мэргэжлийн gaming сэтгүүлч. Дараах англи мэдээг Монгол хэл рүү орчуул.

Дүрэм:
- Монгол геймерүүдэд ойлгомжтой, амьд яриа хэлбэрээр орчуул
- Gaming нэр томьёог (ranked, meta, DLC, patch, FPS, RPG, battle royale гэх мэт) орчуулахгүй, англиараа үлдээ
- Тоглоомын нэрийг орчуулахгүй
- Гарчгийг богино, хурц, уншигчийг татах байдлаар хий
- Агуулгыг 300-500 үгт багтаа
- Монгол геймерт хамаатай эсэхийг тайлбарла (үнэ, тоног төхөөрөмжийн шаардлага гэх мэт)
- Зөвхөн JSON форматаар буцаа:

{"title": "Монгол гарчиг", "body": "Монгол агуулга markdown форматаар"}

Англи гарчиг: ${title}

Англи агуулга:
${body}`,
      },
    ],
  })

  const raw = message.content[0].text.trim()
  // Extract JSON (Claude may add extra text)
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude буруу формат буцаасан')

  return JSON.parse(jsonMatch[0])
}

// --- Build Jekyll post ---
function buildSlug(englishTitle, date) {
  return englishTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
}

function buildPost(translatedTitle, translatedBody, options) {
  const thumbOptions = ['a', 'b', 'c', 'd', 'e', 'f']
  const thumb = options.thumb || thumbOptions[Math.floor(Math.random() * thumbOptions.length)]
  const now = new Date()
  const date = options.date || now.toISOString().split('T')[0]
  const time = `${date} ${now.getHours().toString().padStart(2, '0')}:00:00 +0800`

  // First paragraph as excerpt
  const firstPara = translatedBody.split('\n\n')[0].replace(/[#*_]/g, '').trim()
  const excerpt = firstPara.slice(0, 120)

  const frontMatter = `---
title: "${translatedTitle.replace(/"/g, "'")}"
date: ${time}
category: ${options.category || 'Мэдээ'}
badge: ${options.badge || 'badge-blue'}
thumb: ${thumb}
featured: ${options.featured ? 'true' : 'false'}
translated: true
source_url: "${options.sourceUrl || ''}"
excerpt: "${excerpt}"
---`

  return { frontMatter, date, slug: buildSlug(options.title, date) }
}

// --- Main ---
async function main() {
  const { frontMatter, date, slug } = buildPost('', '', {
    title: args.title,
    category: args.category || 'Мэдээ',
    badge: args.badge || 'badge-blue',
    thumb: args.thumb,
    featured: args['featured'] === 'true',
    sourceUrl: args['source-url'] || '',
    date: args.date,
  })

  let translated
  try {
    translated = await translate(args.title, englishBody)
  } catch (err) {
    console.error('❌  Орчуулга амжилтгүй:', err.message)
    process.exit(1)
  }

  // Rebuild with translated title
  const { frontMatter: fm, date: d, slug: s } = buildPost(translated.title, translated.body, {
    title: args.title,
    category: args.category || 'Мэдээ',
    badge: args.badge || 'badge-blue',
    thumb: args.thumb,
    featured: args['featured'] === 'true',
    sourceUrl: args['source-url'] || '',
    date: args.date,
  })

  const filename = `${d}-${s || 'post'}.md`
  const content = `${fm.replace(/title: ""/, `title: "${translated.title.replace(/"/g, "'")}"`).replace(/excerpt: ""/, `excerpt: "${translated.body.split('\n\n')[0].replace(/[#*_"]/g, '').trim().slice(0, 120)}"`)}\n\n${translated.body}`

  if (args['dry-run']) {
    console.log('\n📄  Файлын агуулга:\n')
    console.log(content)
    console.log(`\n📁  Хадгалах байршил: _posts/${filename}`)
    return
  }

  const outputPath = resolve(ROOT, '_posts', filename)
  writeFileSync(outputPath, content, 'utf8')

  console.log(`\n✅  Орчуулга дууслаа!`)
  console.log(`📁  Файл: _posts/${filename}`)
  console.log(`📰  Гарчиг: ${translated.title}`)
  console.log(`\nДараагийн алхам:`)
  console.log(`  git add _posts/${filename}`)
  console.log(`  git commit -m "post: ${translated.title}"`)
  console.log(`  git push`)
}

main()
