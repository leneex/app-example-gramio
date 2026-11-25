# GramIO

Example [GramIO](https://gramio.dev/) Telegram bot. GramIO is a TypeScript framework for building Telegram bots that runs on Node.js, Bun and Deno.

## Deploy settings

| Field | Value |
| --- | --- |
| Build | Railpack |
| Project directory | `/` |
| Install command | leave empty |
| Build command | leave empty |
| Start command | leave empty |
| Application port | `3000` |
| Health check path | `/` |

## Environment variables

| Variable | Value |
| --- | --- |
| `BOT_TOKEN` | bot token from [@BotFather](https://t.me/BotFather) |
| `APP_URL` | app address, for example `https://app.example.com` |

## <a name="dev"></a>Run locally

```bash
# install dependencies
npm install

# start the app
npm start
```

The app opens at http://localhost:3000.

Requires Node.js 24.12 or later.
