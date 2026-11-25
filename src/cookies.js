import { readFileSync, existsSync } from 'node:fs'

/** Cookies, без которых Вордстат не отдаёт данные. */
export const REQUIRED_COOKIES = ['Session_id', 'sessionid2']

/**
 * Превращает cookies в значение заголовка `Cookie`.
 * Понимает:
 *  - строку заголовка: `Session_id=...; sessionid2=...`
 *  - JSON-экспорт расширений Cookie-Editor / EditThisCookie (массив `{name, value, domain}`)
 *  - объект `{ Session_id: '...', sessionid2: '...' }`
 *  - файл cookies.txt в формате Netscape (curl, yt-dlp, «Get cookies.txt»)
 *  - путь к файлу в любом из этих форматов
 * Оставляет только cookies Яндекса, нужные для входа.
 */
export function parseCookies(input) {
  if (input == null || input === '') throw new Error('Не переданы cookies Яндекса')
  if (typeof input === 'string' && !input.includes('=') && existsSync(input)) input = readFileSync(input, 'utf8')
  let pairs = []
  if (Array.isArray(input)) pairs = fromArray(input)
  else if (typeof input === 'object') pairs = Object.entries(input).map(([k, v]) => [k, String(v)])
  else {
    const text = String(input).replace(/^﻿/, '').trim()
    if (text.startsWith('[') || text.startsWith('{')) {
      const json = JSON.parse(text)
      pairs = Array.isArray(json) ? fromArray(json) : Array.isArray(json.cookies) ? fromArray(json.cookies) : Object.entries(json).map(([k, v]) => [k, String(v)])
    } else if (/^(# Netscape|\S+\t(TRUE|FALSE)\t)/m.test(text)) {
      pairs = text.split(/\r?\n/).map((l) => l.replace(/^#HttpOnly_/, '')).filter((l) => l && !l.startsWith('#'))
        .map((l) => l.split('\t')).filter((f) => f.length >= 7 && /yandex\./.test(f[0])).map((f) => [f[5], f[6]])
    } else {
      pairs = text.replace(/^cookie:\s*/i, '').split(/;\s*/).map((c) => { const i = c.indexOf('='); return [c.slice(0, i).trim(), c.slice(i + 1).trim()] })
    }
  }
  const jar = new Map(pairs.filter(([k, v]) => k && v))
  const missing = REQUIRED_COOKIES.filter((n) => !jar.has(n))
  if (missing.length) throw new Error(`В cookies нет ${missing.join(', ')}. Экспортируйте cookies со страницы wordstat.yandex.com после входа в Яндекс.`)
  return REQUIRED_COOKIES.map((n) => `${n}=${jar.get(n)}`).join('; ')
}

function fromArray(list) {
  return list.filter((c) => c && c.name && (!c.domain || /yandex\./.test(c.domain))).map((c) => [c.name, String(c.value ?? '')])
}
