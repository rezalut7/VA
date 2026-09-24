# Мадам Агриппина AI

Независимый Telegram Mini App: карта дня, вопросы оракулу, расклады на 1/3/7 карт, совместимость, толкование снов, история, избранное, серия посещений, рефералы, напоминания, Telegram Stars и статистика владельца.

## Архитектура

- React + Vite — мобильный интерфейс Mini App.
- Node.js + Express — API, webhook Telegram и раздача frontend.
- PostgreSQL — пользователи, расклады, платежи, лимиты и рефералы.
- OpenAI Responses API — структурированные бережные интерпретации.
- Docker Compose + nginx — отдельный сервис на `oracle.va13.pro` рядом с VA13.

## Локальный запуск

```bash
cp .env.example .env
# заполнить POSTGRES_PASSWORD, DATABASE_URL, SESSION_SECRET и OPENAI_API_KEY
npm install
npm run dev
```

Для браузерной разработки включите `ALLOW_DEV_AUTH=true`. В production это значение должно быть `false`.

## Первый деплой

1. Создать DNS A-запись `oracle.va13.pro` на IP Yandex VM.
2. Скопировать каталог `oracle/` на сервер, создать `.env` и заполнить секреты.
3. Запустить `docker compose up -d --build`.
4. Выдать сертификат Let's Encrypt и включить `nginx/oracle.va13.pro.conf`.
5. Выполнить миграцию, если используется уже существующий PostgreSQL:

   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   ```

6. Настроить webhook Telegram:

   ```bash
   curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     -H "Content-Type: application/json" \
     -d "{\"url\":\"https://oracle.va13.pro/telegram/webhook\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\"}"
   ```

7. В BotFather задать Main Mini App URL: `https://oracle.va13.pro`.
8. Вызывать `POST /internal/reminders` каждый час с `Authorization: Bearer $CRON_SECRET`.

## Монетизация

- 3 бесплатных AI-запроса в сутки.
- 10 дополнительных запросов — 49 Stars.
- Premium на 7 дней — 149 Stars: безлимит и расклады на 3/7 карт.
- Приглашение друга даёт пригласившему 3 бонусных запроса.

Цены управляются переменными окружения. Успешный платёж активируется только после подтверждённого Telegram `successful_payment`.

## Безопасность

- Telegram `initData` проверяется HMAC-подписью на backend.
- Секреты не входят в Docker image и не коммитятся.
- Webhook и cron защищены отдельными секретами.
- Все пользовательские записи ограничены владельцем в SQL-запросах.
- Перед production необходимо перевыпустить переданный в чате токен бота и сохранить новый только в `.env` сервера.
