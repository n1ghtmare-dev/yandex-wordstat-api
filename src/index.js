import { parseCookies } from './cookies.js'

export { parseCookies } from './cookies.js'

export const DEVICES = ['desktop', 'phone', 'tablet']

export class WordstatError extends Error {
  constructor(message, { code = 'error', status, body } = {}) {
    super(message)
    this.name = 'WordstatError'
    this.code = code // auth | invalid_query | rate_limit | http | bad_response
    this.status = status
    this.body = body
  }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** «64 353» → 64353, «0,00063» → 0.00063 */
export const toNumber = (v) => {
  if (typeof v === 'number') return v
  const n = Number(String(v ?? '').replace(/[\s  ]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Date | 'YYYY-MM-DD' | 'DD.MM.YYYY' → Date (UTC, полночь) */
export function toDate(v) {
  if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()))
  const s = String(v)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3]))
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (m) return new Date(Date.UTC(+m[3], m[2] - 1, +m[1]))
  throw new WordstatError(`Не понимаю дату «${s}»: нужен формат ГГГГ-ММ-ДД или ДД.ММ.ГГГГ`, { code: 'invalid_query' })
}

const fmtDate = (d) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`
const addDays = (d, n) => new Date(d.getTime() + n * 864e5)

/**
 * Период по умолчанию и выравнивание границ, которого требует Вордстат:
 * month — с 1-го числа по последнее, week — с понедельника по воскресенье, day — последние 60 дней по вчера.
 */
export function resolvePeriod(period = 'month', from, to, now = new Date()) {
  const today = toDate(now)
  if (period === 'day') {
    // Вордстат отдаёт дневную динамику только за последние 60 дней, иначе — пустой ответ.
    const end = to ? toDate(to) : addDays(today, -1)
    return { from: from ? toDate(from) : addDays(end, -59), to: end }
  }
  if (period === 'week') {
    const lastSunday = addDays(today, -((today.getUTCDay() + 7) % 7 || 7))
    let end = to ? toDate(to) : lastSunday
    end = addDays(end, -((end.getUTCDay() + 7) % 7)) // назад к воскресенью
    let start = from ? toDate(from) : addDays(end, -7 * 52 + 1)
    start = addDays(start, -((start.getUTCDay() + 6) % 7)) // назад к понедельнику
    return { from: start, to: end }
  }
  if (period === 'month') {
    let end = to ? toDate(to) : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0))
    end = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)) // последний день месяца
    let start = from ? toDate(from) : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 23, 1))
    start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
    return { from: start, to: end }
  }
  throw new WordstatError(`period должен быть month, week или day, а не «${period}»`, { code: 'invalid_query' })
}

function devicesValue(devices) {
  if (!devices) return DEVICES.join(',')
  const list = (Array.isArray(devices) ? devices : String(devices).split(',')).map((d) => d.trim()).filter(Boolean)
  const bad = list.filter((d) => !DEVICES.includes(d))
  if (bad.length || !list.length) throw new WordstatError(`devices: допустимо ${DEVICES.join(', ')}`, { code: 'invalid_query' })
  return DEVICES.filter((d) => list.includes(d)).join(',')
}

function checkPhrase(phrase) {
  const p = String(phrase ?? '').trim()
  if (!p) throw new WordstatError('Пустая фраза', { code: 'invalid_query' })
  return p
}

/**
 * Клиент веб-версии Яндекс Вордстата (wordstat.yandex.com).
 *
 *   const ws = new Wordstat({ cookies: 'Session_id=...; sessionid2=...' })
 *   const rows = await ws.top('нейросеть')
 */
export class Wordstat {
  /**
   * @param {object} options
   * @param {string|object|Array} options.cookies  cookies Яндекса (строка, JSON Cookie-Editor, cookies.txt или путь к файлу)
   * @param {number} [options.delay=1500]  пауза между запросами, мс — не долбите Вордстат
   * @param {number} [options.retries=2]   повторы при 429/5xx и сетевых ошибках
   * @param {string} [options.baseUrl='https://wordstat.yandex.com']
   * @param {Function} [options.fetch]     своя реализация fetch (прокси, тесты)
   */
  constructor({ cookies, delay = 1500, retries = 2, baseUrl = 'https://wordstat.yandex.com', fetch: fetchImpl } = {}) {
    this.cookie = parseCookies(cookies)
    this.delay = delay
    this.retries = retries
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.fetch = fetchImpl ?? globalThis.fetch
    this.last = 0
  }

  async request(method, body) {
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + this.delay - Date.now()
      if (wait > 0) await sleep(wait)
      this.last = Date.now()
      let res, text
      try {
        res = await this.fetch(`${this.baseUrl}/wordstat/api/${method}`, {
          method: 'POST',
          redirect: 'manual',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            origin: this.baseUrl,
            referer: `${this.baseUrl}/`,
            'user-agent': UA,
            cookie: this.cookie,
          },
          body: JSON.stringify(body),
        })
        text = await res.text()
      } catch (e) {
        if (attempt < this.retries) { await sleep(2000 * (attempt + 1)); continue }
        throw new WordstatError(`Сеть: ${e.message}`, { code: 'http' })
      }
      if ((res.status === 429 || res.status >= 500) && attempt < this.retries) { await sleep(5000 * (attempt + 1)); continue }
      if (res.status === 429) throw new WordstatError('Вордстат ограничил частоту запросов (429). Увеличьте delay.', { code: 'rate_limit', status: 429 })
      if ((res.status >= 300 && res.status < 400) || res.status === 401 || res.status === 403 || /^\s*</.test(text)) {
        throw new WordstatError('Вордстат не принял сессию: cookies устарели или сняты не с wordstat.yandex.com. Экспортируйте их заново.', { code: 'auth', status: res.status })
      }
      if (!res.ok) throw new WordstatError(`HTTP ${res.status}`, { code: 'http', status: res.status, body: text.slice(0, 500) })
      try { return JSON.parse(text) } catch { throw new WordstatError('Вордстат вернул не JSON', { code: 'bad_response', status: res.status, body: text.slice(0, 500) }) }
    }
  }

  async table(phrase, { region = 'all', devices } = {}) {
    const data = await this.request('getTable', {
      currentDevice: devicesValue(devices), dbname: 'rus',
      filters: { region: String(region), tableType: 'popular' }, searchValue: checkPhrase(phrase),
    })
    const t = data?.table
    if (!t) throw new WordstatError('Неожиданный ответ getTable', { code: 'bad_response', body: JSON.stringify(data).slice(0, 500) })
    if (t.isQueryInvalid) throw new WordstatError(`Вордстат счёл запрос некорректным: «${phrase}»`, { code: 'invalid_query' })
    const rows = (list) => (list ?? []).map((r) => ({ phrase: r.text, count: toNumber(r.value) }))
    return { top: rows(t.tableData?.popular), similar: rows(t.tableData?.associations), period: period(t.info?.period) }
  }

  /** Топ запросов со словами фразы за текущий период Вордстата (до 200 строк). Первая строка — сама фраза. */
  async top(phrase, options) { return (await this.table(phrase, options)).top }

  /** Похожие запросы («что ещё искали») за текущий период Вордстата. */
  async similar(phrase, options) { return (await this.table(phrase, options)).similar }

  /** Частотность фразы за текущий период Вордстата (число из первой строки топа). */
  async count(phrase, options) {
    const top = await this.top(phrase, options)
    return top[0]?.count ?? 0
  }

  /**
   * Динамика по месяцам, неделям или дням.
   * @returns {Promise<Array<{period: string, date: string, count: number, share: number}>>}
   */
  async dynamics(phrase, { period: p = 'month', from, to, region = 'all', devices, now } = {}) {
    const range = resolvePeriod(p, from, to, now)
    const data = await this.request('getGraph', {
      currentDevice: devicesValue(devices), currentGraphType: p, dbname: 'rus',
      filters: { region: String(region), tableType: 'popular' }, searchValue: checkPhrase(phrase),
      startDate: fmtDate(range.from), endDate: fmtDate(range.to),
    })
    const g = data?.graph
    if (!g) throw new WordstatError('Неожиданный ответ getGraph', { code: 'bad_response', body: JSON.stringify(data).slice(0, 500) })
    if (g.isQueryInvalid) throw new WordstatError(`Вордстат счёл запрос некорректным: «${phrase}»`, { code: 'invalid_query' })
    return (g.tableData ?? []).map((r) => ({
      period: r.text,
      date: new Date(r.startTimestamp + 12 * 3600e3).toISOString().slice(0, 10),
      count: toNumber(r.absoluteValue),
      share: toNumber(r.value),
    }))
  }

  /**
   * Распределение по регионам за текущий период Вордстата.
   * affinity — региональная популярность (индекс интереса): 100 — как в среднем, >100 — выше среднего.
   */
  async regions(phrase, { type = 'all', devices } = {}) {
    if (!['all', 'regions', 'cities'].includes(type)) throw new WordstatError('type: all, regions или cities', { code: 'invalid_query' })
    const data = await this.request('getMap', {
      currentDevice: devicesValue(devices), currentMapType: type, dbname: 'rus', searchValue: checkPhrase(phrase),
    })
    const m = data?.map
    if (!m) throw new WordstatError('Неожиданный ответ getMap', { code: 'bad_response', body: JSON.stringify(data).slice(0, 500) })
    if (m.isQueryInvalid) throw new WordstatError(`Вордстат счёл запрос некорректным: «${phrase}»`, { code: 'invalid_query' })
    return (m.tableData ?? []).map((r) => ({
      name: r.text, type: r.type, count: toNumber(r.absoluteValue), share: toNumber(r.relativeValue), affinity: toNumber(r.value),
    }))
  }
}

function period(p) {
  if (!p?.startDate) return null
  const d = (ms) => new Date(ms + 12 * 3600e3).toISOString().slice(0, 10)
  return { from: d(p.startDate), to: d(p.endDate) }
}

export default Wordstat
