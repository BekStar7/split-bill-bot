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

## Как пользоваться

1. Добавь бота в группу, дай ему право читать сообщения (или отключи privacy mode у @BotFather).
2. Кинь фото чека с подписью `@billspliter_bot` — или ответь `@billspliter_bot` на уже отправленное фото. В личке с ботом подпись не нужна.
3. Все участники жмут «Я участвую».
4. Инициатор (кто загрузил чек) выбирает режим. В «Каждый своё» — клик по позиции забирает
   её себе (несколько человек — делится между ними), позиции с 🌐 никто не забрал и они
   делятся на всех.
5. «Посчитать» жмёт тоже только инициатор → бот пишет, кто сколько должен, и сверяет сумму с чеком.

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
