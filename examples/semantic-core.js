// Мини-сбор семантики: для каждой фразы-семени берём топ запросов,
// убираем дубли и сохраняем в CSV, отсортированный по частотности.
//   WORDSTAT_COOKIES=wordstat-cookies.json node examples/semantic-core.js
import { writeFileSync } from 'node:fs'
import { Wordstat } from 'yandex-wordstat-api'

const seeds = ['нейросеть бесплатно', 'chatgpt на русском', 'нейросеть для фото']
const ws = new Wordstat({ cookies: process.env.WORDSTAT_COOKIES ?? 'wordstat-cookies.json' })

const all = new Map()
for (const seed of seeds) {
  for (const { phrase, count } of await ws.top(seed)) {
    if (!all.has(phrase)) all.set(phrase, { phrase, count, seed })
  }
  console.error(`${seed}: готово`)
}

const rows = [...all.values()].sort((a, b) => b.count - a.count)
writeFileSync('semantic-core.csv', ['phrase,count,seed', ...rows.map((r) => `"${r.phrase}",${r.count},"${r.seed}"`)].join('\n'))
console.error(`Сохранено ${rows.length} запросов в semantic-core.csv`)
