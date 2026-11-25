export type Device = 'desktop' | 'phone' | 'tablet'
export type CookiesInput = string | Record<string, string> | Array<{ name: string; value: string; domain?: string }>

export interface WordstatOptions {
  /** cookies Яндекса: строка заголовка, JSON Cookie-Editor, cookies.txt или путь к файлу */
  cookies: CookiesInput
  /** пауза между запросами, мс (по умолчанию 1500) */
  delay?: number
  /** повторы при 429/5xx и сетевых ошибках (по умолчанию 2) */
  retries?: number
  baseUrl?: string
  fetch?: typeof fetch
}

export interface QueryOptions {
  /** 'all' или код региона Яндекса: 225 Россия, 213 Москва, 2 Санкт-Петербург */
  region?: string | number
  devices?: Device[] | string
}

export interface PhraseRow { phrase: string; count: number }
export interface TableResult { top: PhraseRow[]; similar: PhraseRow[]; period: { from: string; to: string } | null }
export interface DynamicsRow { period: string; date: string; count: number; share: number }
export interface RegionRow { name: string; type: 'regions' | 'cities'; count: number; share: number; affinity: number }
type DateInput = Date | string

export class WordstatError extends Error {
  code: 'auth' | 'invalid_query' | 'rate_limit' | 'http' | 'bad_response' | 'error'
  status?: number
  body?: string
}

export class Wordstat {
  constructor(options: WordstatOptions)
  table(phrase: string, options?: QueryOptions): Promise<TableResult>
  top(phrase: string, options?: QueryOptions): Promise<PhraseRow[]>
  similar(phrase: string, options?: QueryOptions): Promise<PhraseRow[]>
  count(phrase: string, options?: QueryOptions): Promise<number>
  dynamics(phrase: string, options?: QueryOptions & { period?: 'month' | 'week' | 'day'; from?: DateInput; to?: DateInput }): Promise<DynamicsRow[]>
  regions(phrase: string, options?: { type?: 'all' | 'regions' | 'cities'; devices?: Device[] | string }): Promise<RegionRow[]>
}

export const DEVICES: Device[]
export function parseCookies(input: CookiesInput): string
export function toNumber(v: unknown): number | null
export function toDate(v: DateInput): Date
export function resolvePeriod(period?: 'month' | 'week' | 'day', from?: DateInput, to?: DateInput, now?: Date): { from: Date; to: Date }
export default Wordstat
