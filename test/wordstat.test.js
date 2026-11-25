import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Wordstat, WordstatError, parseCookies, resolvePeriod, toNumber } from '../src/index.js'

const fixture = (n) => readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8')
const COOKIES = 'Session_id=abc; sessionid2=def; yandexuid=1'

function mockFetch(responses) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers })
    const r = responses.shift()
    return { status: r.status ?? 200, ok: (r.status ?? 200) < 300, text: async () => r.body }
  }
  fn.calls = calls
  return fn
}

test('parseCookies: строка заголовка, лишние cookies отбрасываются', () => {
  assert.equal(parseCookies(COOKIES), 'Session_id=abc; sessionid2=def')
})

test('parseCookies: JSON Cookie-Editor', () => {
  const json = JSON.stringify([
    { name: 'Session_id', value: 'a', domain: '.yandex.com' },
    { name: 'sessionid2', value: 'b', domain: '.yandex.com' },
    { name: 'Session_id', value: 'x', domain: '.google.com' },
  ])
  assert.equal(parseCookies(json), 'Session_id=a; sessionid2=b')
})

test('parseCookies: Netscape cookies.txt из файла', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ws-'))
  const file = join(dir, 'cookies.txt')
  writeFileSync(file, '# Netscape HTTP Cookie File\n#HttpOnly_.yandex.com\tTRUE\t/\tTRUE\t0\tSession_id\ts1\n.yandex.com\tTRUE\t/\tTRUE\t0\tsessionid2\ts2\n')
  assert.equal(parseCookies(file), 'Session_id=s1; sessionid2=s2')
})

test('parseCookies: понятная ошибка без Session_id', () => {
  assert.throws(() => parseCookies('yandexuid=1'), /Session_id/)
})

test('toNumber: пробелы-разделители и запятая', () => {
  assert.equal(toNumber('64 353'), 64353)
  assert.equal(toNumber('15 537'), 15537)
  assert.equal(toNumber('0,00063'), 0.00063)
})

test('top и similar разбирают getTable', async () => {
  const fetch = mockFetch([{ body: fixture('table') }])
  const ws = new Wordstat({ cookies: COOKIES, delay: 0, fetch })
  const t = await ws.table('midjourney', { region: 213, devices: 'phone' })
  assert.deepEqual(t.top[0], { phrase: 'midjourney', count: 71527 })
  assert.equal(t.top.length, 5)
  assert.equal(t.similar.length, 3)
  assert.match(t.period.from, /^\d{4}-\d{2}-\d{2}$/)
  const { body, headers } = fetch.calls[0]
  assert.equal(body.searchValue, 'midjourney')
  assert.equal(body.filters.region, '213')
  assert.equal(body.currentDevice, 'phone')
  assert.equal(headers.cookie, 'Session_id=abc; sessionid2=def')
})

test('dynamics: даты по-русски и числа', async () => {
  const fetch = mockFetch([{ body: fixture('graph') }])
  const ws = new Wordstat({ cookies: COOKIES, delay: 0, fetch })
  const rows = await ws.dynamics('midjourney', { from: '2026-06-15', to: '2026-10-10' })
  assert.deepEqual(rows[0], { period: 'июнь 2026', date: '2026-06-01', count: 64353, share: 0.00063 })
  assert.equal(fetch.calls[0].body.startDate, '01.06.2026')
  assert.equal(fetch.calls[0].body.endDate, '31.10.2026')
})

test('regions', async () => {
  const fetch = mockFetch([{ body: fixture('map') }])
  const ws = new Wordstat({ cookies: COOKIES, delay: 0, fetch })
  const rows = await ws.regions('midjourney')
  assert.deepEqual(rows[0], { name: 'Москва и область', type: 'regions', count: 15537, share: 0.000781, affinity: 111.19 })
})

test('протухшая сессия → WordstatError auth', async () => {
  const fetch = mockFetch([{ body: '<!DOCTYPE html><title>Log in</title>' }])
  const ws = new Wordstat({ cookies: COOKIES, delay: 0, fetch })
  await assert.rejects(ws.top('x'), (e) => e instanceof WordstatError && e.code === 'auth')
})

test('повтор после 429', async () => {
  const fetch = mockFetch([{ status: 429, body: '' }, { body: fixture('table') }])
  const ws = new Wordstat({ cookies: COOKIES, delay: 0, retries: 1, fetch })
  const t0 = Date.now()
  const rows = await ws.top('midjourney')
  assert.equal(rows[0].count, 71527)
  assert.ok(Date.now() - t0 >= 4900)
})

test('resolvePeriod выравнивает границы', () => {
  const now = new Date('2026-11-25T10:00:00Z') // среда
  const m = resolvePeriod('month', undefined, undefined, now)
  assert.equal(m.to.toISOString().slice(0, 10), '2026-10-31')
  assert.equal(m.from.toISOString().slice(0, 10), '2024-11-01')
  const w = resolvePeriod('week', undefined, undefined, now)
  assert.equal(w.to.toISOString().slice(0, 10), '2026-11-22') // воскресенье
  assert.equal(w.from.getUTCDay(), 1) // понедельник
  const d = resolvePeriod('day', undefined, undefined, now)
  assert.equal(d.to.toISOString().slice(0, 10), '2026-11-24')
  assert.equal(d.from.toISOString().slice(0, 10), '2026-09-26')
})
