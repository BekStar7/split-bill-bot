# SplitCheck Bot 🧾

Telegram-бот для групповых чатов: кидаешь фото чека — бот распознаёт позиции и делит счёт
между участниками. Поровну или «каждый своё», с общими позициями (кальян, хлеб) и
пропорциональным сервисным сбором.

Подробно про идеи и устройство — в [ARCHITECTURE.md](./ARCHITECTURE.md).

## Стек

Node 22 · TypeScript · [grammY](https://grammy.dev) · Claude Vision (structured output) ·
SQLite (better-sqlite3 + drizzle) · Docker

## Быстрый старт

```bash
cp .env.example .env        # вписать BOT_TOKEN и ANTHROPIC_API_KEY
pnpm install
pnpm db:generate             # сгенерировать миграции из src/db/schema.ts
pnpm dev                     # long polling, hot reload
```

Тесты и типы:

```bash
pnpm test
pnpm typecheck
```

## Деплой на VPS

```bash
docker compose up -d --build
docker compose logs -f bot
```

БД лежит в `./data/splitcheck.db` — бэкап = копия одного файла.

## Деплой на Fly.io (автоматический)

Каждый push в `main` запускает `.github/workflows/deploy.yml`: typecheck → lint → test → `flyctl deploy`.
Руками деплоить не нужно. Разовая настройка — положить токен Fly в секреты репозитория:

```bash
fly tokens create deploy -x 999999h -a split-bill-bot   # скопируй вывод целиком
# GitHub → Settings → Secrets and variables → Actions → New repository secret
# Name: FLY_API_TOKEN, Value: токен из команды выше
```

Секреты самого бота (`BOT_TOKEN`, `ANTHROPIC_API_KEY`, …) живут в `fly secrets`, а не в GitHub.

Если коммит не должен уезжать на прод (README, CI-конфиг, тесты, рефактор без изменения рантайма) —
добавь `[skip deploy]` (или короче `[skip]`) в сообщение коммита. Typecheck/lint/test всё равно
прогонятся, а вот `flyctl deploy` пропустится:

```bash
git commit -m "docs: update README [skip deploy]"
```

## Как пользоваться

1. Добавь бота в группу, дай ему право читать сообщения (или отключи privacy mode у @BotFather).
2. Кинь фото чека с подписью `@billspliter_bot` — или ответь `@billspliter_bot` на уже отправленное фото. В личке с ботом подпись не нужна.
3. Все участники жмут «Я участвую».
4. Инициатор (кто загрузил чек) выбирает режим. В «Каждый своё» — клик по позиции забирает
   её себе (несколько человек — делится между ними). Если позиций несколько (кола ×3),
   каждый клик берёт ещё одну штуку, клик сверх свободного снимает тебя. Позиции с 🌐
   никто не забрал, и они делятся на всех.
5. «Посчитать» жмёт тоже только инициатор → бот пишет в чат, кто сколько должен, и сверяет сумму с чеком.
   Кнопка «Подробнее» под итогами открывает личку с ботом, где он показывает твою часть счёта по позициям.

## Структура

```
src/
  core/       чистая логика деления — без I/O, покрыта тестами
  ocr/        фото чека → JSON через Claude
  db/         drizzle-схема, репозиторий
  services/   жизненный цикл счёта
  bot/        grammY: хендлеры, клавиатуры, рендер сообщений
tests/
```
