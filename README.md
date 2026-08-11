# Open Food Facts proxy

В отличие от `fatsecret-proxy`, здесь **не нужен никакой секретный ключ** —
Open Food Facts бесплатный и открытый. Этот сервер решает только две задачи:

1. Правильные CORS-заголовки (чтобы браузер разрешил к нему обращаться).
2. Приводит ответ к тому же формату, который уже ждёт фронтенд:
   - `GET /api/food/search?q=молоко` → `[{ id, name }, ...]`
   - `GET /api/food/:id` → `{ id, name, servings: [{ id, label, kcal, protein, carbs, fat }] }`

## Запуск

```bash
npm install
npm start
```

Поднимется на `http://localhost:3002`. Проверить:

```bash
curl "http://localhost:3002/api/food/search?q=молоко"
```

## Деплой через GitHub + Render (проще всего)

1. Создайте пустой репозиторий на GitHub, например `openfoodfacts-proxy`.
2. В этой папке выполните:
   ```bash
   git init
   git add .
   git commit -m "Open Food Facts proxy"
   git branch -M main
   git remote add origin https://github.com/ВАШ_АККАУНТ/openfoodfacts-proxy.git
   git push -u origin main
   ```
3. Зайдите на **render.com** → New → Blueprint → выберите этот репозиторий.
   Render сам прочитает `render.yaml` и всё настроит — секретов тут вводить не
   нужно, у Open Food Facts их просто нет.
4. После деплоя Render даст публичный URL вида `https://openfoodfacts-proxy.onrender.com`.
   Проверьте: `https://openfoodfacts-proxy.onrender.com/api/food/search?q=молоко`.

## Деплой

Любой хостинг с Node (Render, Railway, Fly.io, обычный VPS). Секретов в переменных
окружения не требуется — задавать нечего, просто задеплойте и укажите домен.

## Что поменять во фронтенде после деплоя

В файле приложения найдите блок `FOOD PROVIDER (live + fallback)` и замените в
`searchFoods` / `getFoodDetails` прямые вызовы `world.openfoodfacts.org` на вызовы
своего домена, например:

```js
const res = await fetch(`https://your-proxy.example.com/api/food/search?q=${encodeURIComponent(q)}`);
```

Остальную логику (мок как запасной вариант, обработку ошибок) можно не трогать —
она уже написана так, чтобы ничего не сломать, если прокси временно недоступен.
