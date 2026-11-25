#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { Wordstat, WordstatError } from '../src/index.js'

const HELP = `wordstat — Яндекс Вордстат из командной строки (бесплатно, через ваш аккаунт Яндекса)

Команды:
  wordstat top "фраза"         топ запросов (до 200 строк)
  wordstat similar "фраза"     похожие запросы
  wordstat count "фраза"       одно число — частотность фразы
  wordstat dynamics "фраза"    динамика: --period month|week|day --from 2025-01-01 --to 2026-10-31
  wordstat regions "фраза"     регионы: --type all|regions|cities
  wordstat batch phrases.txt   топ (и с --similar похожие) по списку фраз, одна фраза в строке

Опции:
  --cookies <файл|строка>   cookies Яндекса; иначе WORDSTAT_COOKIES или ./wordstat-cookies.json
  --region <код>            регион Яндекса: 225 Россия, 213 Москва, 2 Санкт-Петербург (по умолчанию все)
  --devices <список>        desktop,phone,tablet (по умолчанию все)
  --format <формат>         table (по умолчанию в терминале), tsv, csv, excel (для Excel: «;» и BOM), json
  --limit <n>               вывести только первые n строк
  --delay <мс>              пауза между запросами, по умолчанию 1500
  -h, --help                эта справка

Где взять cookies: войдите в Яндекс, откройте https://wordstat.yandex.com, экспортируйте cookies
расширением Cookie-Editor (Export → JSON) в файл wordstat-cookies.json. Подробно — в README.`

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    cookies: { type: 'string' }, region: { type: 'string' }, devices: { type: 'string' },
    period: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, type: { type: 'string' },
    format: { type: 'string' }, limit: { type: 'string' }, delay: { type: 'string' },
    similar: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  },
})

const [cmd, ...rest] = positionals
const arg = rest.join(' ')
if (o.help || !cmd) { console.log(HELP); process.exit(cmd || o.help ? 0 : 1) }

function cookieSource() {
  if (o.cookies) return o.cookies
  if (process.env.WORDSTAT_COOKIES) return process.env.WORDSTAT_COOKIES
  for (const f of ['wordstat-cookies.json', 'wordstat-cookies.txt', 'cookies.txt']) if (existsSync(f)) return f
  fail('Нет cookies Яндекса. Передайте --cookies <файл>, задайте WORDSTAT_COOKIES или положите wordstat-cookies.json рядом. См. wordstat --help')
}

function fail(msg, code = 1) { console.error(`wordstat: ${msg}`); process.exit(code) }

const format = o.format ?? (process.stdout.isTTY ? 'table' : 'tsv')
if (!['table', 'tsv', 'csv', 'excel', 'json'].includes(format)) fail('--format: table, tsv, csv, excel или json')

function print(rows) {
  if (o.limit) rows = rows.slice(0, Number(o.limit))
  if (format === 'json') return console.log(JSON.stringify(rows, null, 2))
  if (!rows.length) return format === 'table' ? console.error('(пусто)') : undefined
  const cols = Object.keys(rows[0])
  if (format === 'tsv') return console.log([cols.join('\t'), ...rows.map((r) => cols.map((c) => r[c] ?? '').join('\t'))].join('\n'))
  if (format === 'csv' || format === 'excel') {
    // excel: разделитель «;» и BOM — так русский Excel открывает файл двойным кликом, с колонками и кириллицей
    const sep = format === 'excel' ? ';' : ','
    const q = (v) => (/[",\n;]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''))
    return console.log((format === 'excel' ? '﻿' : '') + [cols.join(sep), ...rows.map((r) => cols.map((c) => q(r[c])).join(sep))].join('\n'))
  }
  const show = (v) => (typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: 6 }) : String(v ?? ''))
  const cells = rows.map((r) => cols.map((c) => show(r[c])))
  const w = cols.map((c, i) => Math.max(c.length, ...cells.map((r) => r[i].length)))
  const num = cols.map((c) => typeof rows[0][c] === 'number')
  const line = (r) => r.map((v, i) => (num[i] ? v.padStart(w[i]) : v.padEnd(w[i]))).join('  ')
  console.log([line(cols), w.map((n) => '─'.repeat(n)).join('  '), ...cells.map(line)].join('\n'))
}

const commands = ['top', 'similar', 'count', 'dynamics', 'regions', 'batch']
if (!commands.includes(cmd)) fail(`неизвестная команда «${cmd}». Есть: ${commands.join(', ')}`)
if (!arg) fail(cmd === 'batch' ? 'укажите файл со списком фраз' : 'укажите фразу')

const ws = new Wordstat({ cookies: cookieSource(), delay: o.delay ? Number(o.delay) : undefined })
const opts = { region: o.region, devices: o.devices }

try {
  if (cmd === 'top') print(await ws.top(arg, opts))
  else if (cmd === 'similar') print(await ws.similar(arg, opts))
  else if (cmd === 'count') console.log(await ws.count(arg, opts))
  else if (cmd === 'dynamics') print(await ws.dynamics(arg, { ...opts, period: o.period, from: o.from, to: o.to }))
  else if (cmd === 'regions') print(await ws.regions(arg, { devices: o.devices, type: o.type }))
  else if (cmd === 'batch') {
    const phrases = readFileSync(arg, 'utf8').split(/\r?\n/).map((s) => s.replace(/#.*/, '').trim()).filter(Boolean)
    const out = []
    for (const [i, seed] of phrases.entries()) {
      try {
        const t = await ws.table(seed, opts)
        out.push(...t.top.map((r) => ({ ...r, seed, kind: 'top' })))
        if (o.similar) out.push(...t.similar.map((r) => ({ ...r, seed, kind: 'similar' })))
        console.error(`[${i + 1}/${phrases.length}] ${seed}: ${t.top[0]?.count ?? 0}`)
      } catch (e) {
        if (e instanceof WordstatError && e.code !== 'invalid_query') throw e
        console.error(`[${i + 1}/${phrases.length}] ${seed}: пропущено — ${e.message}`)
      }
    }
    print(out)
  }
} catch (e) {
  fail(e instanceof WordstatError ? e.message : e.stack, e.code === 'auth' ? 3 : 2)
}
