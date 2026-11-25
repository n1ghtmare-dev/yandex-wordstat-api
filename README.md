# Yandex Wordstat API — бесплатный парсер Вордстата для Node.js и командной строки

[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![zero dependencies](https://img.shields.io/badge/dependencies-0-blue)

**Яндекс Вордстат из кода и терминала без платного API.** Частотность, топ запросов, похожие запросы, динамика по месяцам, неделям и дням, распределение по регионам и городам. Работает через ваш обычный аккаунт Яндекса. Ключи Yandex Cloud, капча и браузер не нужны.

```console
$ npx github:n1ghtmare-dev/yandex-wordstat-api top "нейросеть бесплатно" --limit 5
phrase                              count
──────────────────────────────  ─────────
нейросеть бесплатно             1 333 755
нейросеть онлайн бесплатно        314 696
нейросеть фото бесплатно          306 849
нейросеть на русском бесплатно    189 260
ии нейросеть бесплатно            165 640
```

<sub>English summary is [at the bottom](#english).</sub>

---

## Содержание

- [Зачем это нужно](#зачем-это-нужно)
- [Что умеет](#что-умеет)
- [Установка](#установка)
- [Где взять cookies (1 минута)](#где-взять-cookies-1-минута)
- [Командная строка](#командная-строка)
- [Библиотека для Node.js](#библиотека-для-nodejs)
- [Коды регионов](#коды-регионов)
- [Ограничения и честная работа](#ограничения-и-честная-работа)
- [FAQ](#faq)

## Зачем это нужно

Официальный Wordstat API от Яндекса переехал в Yandex Cloud (Search API). Там нужен платёжный аккаунт, сервисный аккаунт, роли и API-ключ, а каждый запрос стоит денег. Для сбора семантики под блог или небольшой проект это слишком тяжело.

Веб-версия [wordstat.yandex.com](https://wordstat.yandex.com) показывает те же данные бесплатно любому, кто вошёл в Яндекс. Эта библиотека делает к ней те же запросы, что и сама страница, и возвращает чистый JSON:

| | Официальный API (Yandex Cloud) | `yandex-wordstat-api` |
|---|---|---|
| Цена | платно за каждый запрос | бесплатно |
| Что нужно | платёжный аккаунт, каталог, сервисный аккаунт, роль, ключ | аккаунт Яндекса |
| Настройка | полчаса и больше | одна минута |
| Свежесть данных | по [документации](https://aistudio.yandex.ru/ru/docs/search-api/concepts/wordstat) статистика после 7 октября 2026 недоступна (на 25.11.2026) | те же данные, что на сайте Вордстата |
| Зависимости | SDK или свой клиент | 0, только Node.js 18+ |

## Что умеет

- **`top`**: топ запросов со словами фразы, до 200 строк. Первая строка — сама фраза с общей частотностью. Даты периода приходят в поле `period`.
- **`similar`**: похожие запросы, блок «что ещё искали».
- **`count`**: одно число, частотность фразы. Удобно для скриптов.
- **`dynamics`**: динамика по месяцам, неделям или дням, с абсолютным числом запросов и долей.
- **`regions`**: распределение по регионам и городам с индексом региональной популярности (affinity).
- **`batch`**: сбор по списку фраз из файла, на выходе TSV, CSV или JSON. Это основа для семантического ядра.
- Фильтры по региону (`--region 213`) и устройствам (`--devices phone`).
- Операторы Вордстата (`"кавычки"`, `-минус слова`, `!точная форма`, `[порядок слов]`, `(а|б)`) передаются как есть и фильтруют список так же, как на сайте.
- Пауза между запросами и повторы при 429/5xx встроены, так что Вордстат никто не долбит.
- Типы TypeScript в комплекте.

## Установка

Нужны Node.js 18 или новее и [Git](https://git-scm.com/downloads): npm скачивает пакет с GitHub через git. Если на Windows `npx` пишет `spawn git ENOENT`, поставьте Git for Windows и откройте терминал заново.

```bash
# запустить без установки
npx github:n1ghtmare-dev/yandex-wordstat-api top "chatgpt"

# поставить команду wordstat глобально
npm i -g github:n1ghtmare-dev/yandex-wordstat-api

# или как библиотеку в проект
npm i github:n1ghtmare-dev/yandex-wordstat-api
```

## Где взять cookies (1 минута)

Вордстат отдаёт данные только вошедшему пользователю, поэтому библиотеке нужны две cookies вашей сессии Яндекса: `Session_id` и `sessionid2`. Остальное она отбрасывает сама.

1. Войдите в Яндекс и откройте **https://wordstat.yandex.com** (домен именно `.com`).
2. Поставьте расширение [Cookie-Editor](https://cookie-editor.com/) для Chrome, Firefox или Edge.
3. На вкладке Вордстата нажмите Cookie-Editor → **Export** → **JSON**.
4. Сохраните содержимое в файл `wordstat-cookies.json` в папке, где запускаете команду.

Подойдут и другие форматы:

- файл `cookies.txt` в формате Netscape (расширение «Get cookies.txt», `yt-dlp`, `curl`);
- строка заголовка `Session_id=...; sessionid2=...` в переменной окружения `WORDSTAT_COOKIES`;
- путь к файлу в `--cookies` или в `WORDSTAT_COOKIES`.

> ⚠️ Cookies дают доступ к вашему аккаунту Яндекса. Не коммитьте их и никому не отправляйте. `wordstat-cookies.*` и `cookies.txt` уже есть в `.gitignore` этого репозитория. Для парсинга удобно завести отдельный аккаунт.

Когда сессия протухнет (например, после выхода из аккаунта), команда завершится с кодом `3` и сообщением «Вордстат не принял сессию». Тогда экспортируйте cookies заново.

## Командная строка

```bash
wordstat top "нейросеть бесплатно"                # топ запросов
wordstat similar "midjourney" --limit 20          # похожие запросы
wordstat count "chatgpt" --region 213             # частотность в Москве, одно число
wordstat dynamics "chatgpt"                       # по месяцам за последние 2 года
wordstat dynamics "chatgpt" --period week         # по неделям за последний год
wordstat dynamics "chatgpt" --period day          # по дням за последние 60 дней
wordstat dynamics "chatgpt" --from 2025-01-01 --to 2025-12-31
wordstat regions "chatgpt" --type cities          # по городам
wordstat top "chatgpt" --devices phone            # только мобильные
wordstat batch seeds.txt --similar --format csv > core.csv   # семантика по списку
wordstat batch seeds.txt --format excel > core.csv          # то же, сразу открывается в Excel
```

| Опция | Что делает |
|---|---|
| `--cookies <файл\|строка>` | cookies Яндекса. Без опции берутся из `WORDSTAT_COOKIES` или файла `./wordstat-cookies.json` |
| `--region <код>` | регион Яндекса, см. [коды](#коды-регионов). По умолчанию все регионы |
| `--devices <список>` | `desktop`, `phone`, `tablet` через запятую |
| `--period` | для `dynamics`: `month` (по умолчанию), `week`, `day` |
| `--from`, `--to` | для `dynamics`: даты `ГГГГ-ММ-ДД` или `ДД.ММ.ГГГГ`. Границы сами выравниваются по месяцам и неделям |
| `--type` | для `regions`: `all`, `regions`, `cities` |
| `--format` | `table` (по умолчанию в терминале), `tsv` (по умолчанию при выводе в файл), `csv`, `excel` (CSV с «;» и BOM: русский Excel открывает двойным кликом), `json` |
| `--limit <n>` | вывести только первые n строк |
| `--similar` | для `batch`: собрать ещё и похожие запросы |
| `--delay <мс>` | пауза между запросами, по умолчанию 1500 |

Файл для `batch` содержит одну фразу в строке. Всё после `#` считается комментарием:

```text
# seeds.txt
нейросеть бесплатно
chatgpt на русском
нейросеть для фото   # картинки
```

На выходе колонки `phrase, count, seed, kind`, где `kind` равен `top` или `similar`. Прогресс пишется в stderr, данные в stdout, поэтому вывод можно сразу перенаправить в файл.

Пример `dynamics`:

```console
$ wordstat dynamics chatgpt --limit 3
period        date            count  share
────────────  ──────────  ─────────  ─────
ноябрь 2024   2024-11-01    711 626  0,006
декабрь 2024  2024-12-01    947 066  0,008
январь 2025   2025-01-01  1 041 170  0,009
```

Пример `regions`:

```console
$ wordstat regions chatgpt --type cities --limit 3
name             type     count  share  affinity
───────────────  ──────  ──────  ─────  ────────
Санкт-Петербург  cities  97 302  0,019     126,9
Белгород         cities   4 162  0,012     79,53
Иваново          cities   4 726  0,014     94,23
```

## Библиотека для Node.js

```js
import { Wordstat, WordstatError } from 'yandex-wordstat-api'

const ws = new Wordstat({ cookies: 'wordstat-cookies.json' })

await ws.count('нейросеть бесплатно')
// 1333755

await ws.top('нейросеть бесплатно', { region: 225, devices: ['phone'] })
// [{ phrase: 'нейросеть бесплатно', count: 1333755 }, { phrase: 'нейросеть онлайн бесплатно', count: 314696 }, ...]

await ws.similar('midjourney')
// [{ phrase: 'миджорни', count: 14843 }, ...]

const { top, similar, period } = await ws.table('midjourney') // топ и похожие одним запросом
// period: { from: '2026-09-18', to: '2026-11-16' }

await ws.dynamics('chatgpt', { period: 'month', from: '2025-01-01', to: '2025-12-31' })
// [{ period: 'январь 2025', date: '2025-01-01', count: 1041170, share: 0.009 }, ...]

await ws.regions('chatgpt', { type: 'cities' })
// [{ name: 'Санкт-Петербург', type: 'cities', count: 97302, share: 0.019, affinity: 126.9 }, ...]
```

Опции конструктора:

| Опция | По умолчанию | |
|---|---|---|
| `cookies` | обязательна | строка заголовка, объект `{ Session_id, sessionid2 }`, массив из Cookie-Editor, текст cookies.txt или путь к файлу |
| `delay` | `1500` | минимальная пауза между запросами, мс |
| `retries` | `2` | повторы при 429, 5xx и сетевых ошибках |
| `fetch` | `globalThis.fetch` | своя реализация, например с прокси (`undici` `ProxyAgent`) или для тестов |

Ошибки приходят как `WordstatError` с полем `code`:

- `auth`: cookies протухли или сняты не с `wordstat.yandex.com`;
- `invalid_query`: Вордстат не принял фразу, например из-за неверного оператора, или неверные параметры;
- `rate_limit`: слишком часто, увеличьте `delay`;
- `http`, `bad_response`: сеть или неожиданный ответ.

```js
try {
  await ws.top('chatgpt')
} catch (e) {
  if (e instanceof WordstatError && e.code === 'auth') console.log('Пора обновить cookies')
  else throw e
}
```

Готовый пример сбора семантического ядра в CSV лежит в [`examples/semantic-core.js`](examples/semantic-core.js). Пошаговый гайд, как собрать ядро этим инструментом и почистить его бесплатной нейросетью: [«Как собрать семантическое ядро бесплатно: Вордстат + нейросеть»](https://unboxai.ru/blog/sobrat-semanticheskoe-yadro-nejrosetyu).

## Коды регионов

Параметр `region` принимает код региона Яндекса (тот же, что в `lr=` поиска и в URL Вордстата). Самые частые:

| Код | Регион | Код | Регион |
|---|---|---|---|
| `225` | Россия | `213` | Москва |
| `1` | Москва и область | `2` | Санкт-Петербург |
| `10174` | СПб и Ленинградская область | `54` | Екатеринбург |
| `65` | Новосибирск | `43` | Казань |
| `47` | Нижний Новгород | `35` | Краснодар |
| `187` | Украина | `149` | Беларусь |
| `159` | Казахстан | `all` | все регионы (по умолчанию) |

Код любого другого региона виден в адресной строке Вордстата после выбора региона: `...&region=54`.

## Ограничения и честная работа

- **Нет постраничной выдачи.** `top` и `similar` возвращают то же, что первая страница сайта: до 200 строк топа. Чтобы копнуть глубже, уточняйте фразы (`нейросеть бесплатно фото`, `нейросеть бесплатно текст`) или используйте `batch`.
- **Период фиксирован.** Таблица и регионы считаются за тот же период, что показывает сайт. Его даты возвращает `ws.table()` в поле `period`. Дневная динамика доступна только за последние 60 дней.
- **Частота запросов.** По умолчанию не чаще одного запроса в 1,5 секунды. Не ставьте `delay` меньше секунды и не гоняйте тысячи фраз подряд. Яндекс может временно ограничить аккаунт.
- **Неофициальный способ.** Библиотека повторяет запросы веб-страницы Вордстата. Если Яндекс поменяет страницу, что-то может сломаться. Напишите в [issues](https://github.com/n1ghtmare-dev/yandex-wordstat-api/issues), починим.
- Используйте на свой страх и риск и в рамках [условий Яндекса](https://yandex.ru/legal/). Для промышленных объёмов есть официальный платный API в Yandex Cloud.

## FAQ

**Это бесплатно?** Да. Библиотека не обращается к платному API Yandex Cloud, а берёт данные из веб-версии Вордстата, которая бесплатна для вошедших пользователей.

**Чем это отличается от Key Collector, Словоёба и других парсеров Вордстата?** Это не программа с интерфейсом, а маленькая open-source библиотека и CLI на чистом Node.js. Её удобно встроить в свои скрипты, n8n, GitHub Actions, генераторы контента или SEO-дашборды.

**Нужна ли капча или антикапча?** Нет. Запросы идут с вашей сессией так же, как из браузера.

**Почему именно wordstat.yandex.com, а не .ru?** Сессия, снятая на `.com`, принимается API на `.com`. Если экспортировать cookies с `wordstat.yandex.ru`, получите ошибку `auth`.

**Можно из Python или PHP?** Сейчас это пакет для Node.js, но протокол простой. Это `POST https://wordstat.yandex.com/wordstat/api/getTable` (а также `getGraph` и `getMap`) с JSON-телом и cookie `Session_id` и `sessionid2`. Тела запросов видны в [`src/index.js`](src/index.js), портировать их легко. PR с портами приветствуются.

**Работает на сервере?** Да, если сервер может достучаться до `wordstat.yandex.com`. Cookies можно передать через переменную окружения `WORDSTAT_COOKIES`.

## Разработка

```bash
git clone https://github.com/n1ghtmare-dev/yandex-wordstat-api
cd yandex-wordstat-api
npm test        # node:test, без сети: на сохранённых ответах Вордстата
```

---

## English

**Free Yandex Wordstat API client and CLI for Node.js.** It gets keyword search volume, related queries, monthly, weekly and daily trends, and regional breakdowns from [Yandex Wordstat](https://wordstat.yandex.com) using your regular Yandex account session. You don't need a Yandex Cloud billing account or API key, and the package has zero dependencies.

```bash
npx github:n1ghtmare-dev/yandex-wordstat-api top "chatgpt" --format json
```

```js
import { Wordstat } from 'yandex-wordstat-api'
const ws = new Wordstat({ cookies: 'wordstat-cookies.json' }) // Cookie-Editor JSON export from wordstat.yandex.com
const rows = await ws.top('chatgpt', { region: 225 })         // [{ phrase, count }]
const trend = await ws.dynamics('chatgpt', { period: 'week' }) // [{ period, date, count, share }]
const geo = await ws.regions('chatgpt', { type: 'cities' })    // [{ name, type, count, share, affinity }]
```

Methods: `top`, `similar`, `table`, `count`, `dynamics`, `regions`. CLI commands: `top`, `similar`, `count`, `dynamics`, `regions`, `batch`. Output formats are `table`, `tsv`, `csv`, `excel` and `json`. Only the `Session_id` and `sessionid2` cookies are used. Keep them secret. The client is unofficial, rate-limited by default (1.5 s between requests) and mirrors the requests of the Wordstat web page.
