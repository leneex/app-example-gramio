import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import { Bot, webhookHandler } from "gramio";

// Read the version of the installed GramIO package
const gramioPkgUrl = new URL("../package.json", import.meta.resolve("gramio"));
const gramioVersion: string =
  JSON.parse(fs.readFileSync(gramioPkgUrl, "utf-8")).version ?? "0.15.3";

// App port from the PORT variable; 3000 by default
const port = Number(process.env.PORT) || 3000;

const botToken = process.env.BOT_TOKEN;
const appUrl = process.env.APP_URL;

// Webhook secret: SHA-256 of the token in hex
const secretToken = botToken
  ? crypto.createHash("sha256").update(botToken).digest("hex")
  : null;

type BotState =
  | { type: "missing_env" }
  | { type: "running"; username: string }
  | { type: "error"; message: string };

let botState: BotState =
  !botToken || !appUrl
    ? { type: "missing_env" }
    : { type: "error", message: "Starting..." };

let bot: Bot | null = null;
let webhookHandlerFn: ReturnType<typeof webhookHandler> | null = null;

// Mask the token and the secret so they do not leak
function sanitize(text: string): string {
  let result = text;
  if (botToken) {
    result = result.replaceAll(botToken, "[REDACTED]");
  }
  if (secretToken) {
    result = result.replaceAll(secretToken, "[REDACTED]");
  }
  return result;
}

// Escape HTML characters
function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Build the HTML page
function renderPage(): string {
  let statusHtml = "";

  if (botState.type === "missing_env") {
    statusHtml =
      "<p>Set the BOT_TOKEN and APP_URL environment variables to start the bot.</p>";
  } else if (botState.type === "running") {
    const user = escapeHtml(botState.username);
    statusHtml = `<p>Bot @${user} is running. <a href="https://t.me/${user}" target="_blank" rel="noopener noreferrer">Open in Telegram</a></p>`;
  } else {
    statusHtml = `<p>The bot did not start: ${escapeHtml(botState.message)}</p>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GramIO</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 2rem 1rem;
      display: flex;
      justify-content: center;
    }
    .container {
      max-width: 600px;
      width: 100%;
    }
    h1 {
      margin-top: 0;
      font-size: 2rem;
    }
    .info {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.25rem 1rem;
      margin: 1.5rem 0;
    }
    dt {
      color: #666;
    }
    dd {
      margin: 0;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.9em;
      background: rgba(127, 127, 127, 0.12);
      padding: 0.15em 0.35em;
      border-radius: 4px;
    }
    a {
      color: #0969da;
    }
    .status {
      margin: 1.5rem 0;
      padding: 1rem;
      border-radius: 6px;
      background: rgba(127, 127, 127, 0.08);
    }
    .status p {
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Hello world</h1>
    <dl class="info">
      <dt>GramIO</dt>
      <dd><code>${escapeHtml(gramioVersion)}</code></dd>
      <dt>Node.js</dt>
      <dd><code>${escapeHtml(process.version)}</code></dd>
    </dl>
    <div class="status">
      ${statusHtml}
    </div>
  </div>
</body>
</html>`;
}

// Start the bot if the environment variables are set
async function initBot(): Promise<void> {
  if (!botToken || !appUrl || !secretToken) {
    return;
  }

  try {
    // Webhook URL: APP_URL without the trailing slash, plus /webhook
    const webhookUrl = `${appUrl.replace(/\/+$/, "")}/webhook`;

    bot = new Bot(botToken);

    // Handle errors while the bot is running
    bot.onError(({ error }) => {
      const rawMsg = error instanceof Error ? error.message : String(error);
      console.error("Bot error:", sanitize(rawMsg));
    });

    // The bot greets the user on /start
    bot.command("start", (context) => {
      return context.send(
        "Hello world! I am a bot built with GramIO. Send me any text and I will repeat it."
      );
    });

    // The bot repeats any text message
    bot.on("message", (context) => {
      if (context.text) {
        return context.send(`You said: ${context.text}`);
      }
    });

    // GramIO webhook handler for node:http
    webhookHandlerFn = webhookHandler(bot, "http", secretToken);

    // Register the webhook in Telegram
    const info = await bot.start({
      webhook: {
        url: webhookUrl,
        secret_token: secretToken,
      },
    });

    botState = { type: "running", username: info.username ?? "" };
    console.log(`Bot @${info.username} is running`);
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const safeMsg = sanitize(rawMsg);
    botState = { type: "error", message: safeMsg };
    console.error("The bot did not start:", safeMsg);
  }
}

// The server starts listening right away, without waiting for the bot
const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = url.pathname;

  // Home page
  if (method === "GET" && pathname === "/") {
    const html = renderPage();
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(html),
    });
    res.end(html);
    return;
  }

  // Telegram webhook
  if (method === "POST" && pathname === "/webhook") {
    // While the bot is not running, answer 503
    if (botState.type !== "running" || !webhookHandlerFn || !secretToken) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Service Unavailable");
      return;
    }

    // Check the Telegram secret header
    const headerSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (!headerSecret || headerSecret !== secretToken) {
      res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Unauthorized");
      return;
    }

    // Pass the request to the GramIO handler
    webhookHandlerFn(req, res);
    return;
  }

  // Any other path or method: 404
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
});

// Start the bot in the background
void initBot();

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Shut down on SIGTERM and SIGINT
let isShuttingDown = false;

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  server.close();

  if (bot) {
    try {
      await bot.stop();
    } catch (err: unknown) {
      console.error("Error stopping bot:", sanitize(String(err)));
    }
  }

  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
