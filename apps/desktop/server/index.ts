import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from "node:http";
import { ChatGPTCallbackPort, handleChatGPTCallback } from "./oauth/chatgpt";

type ChatGPTCallbackResult = Awaited<ReturnType<typeof handleChatGPTCallback>>;
type HaxAuthCallbackResult = {
  detail: string;
  ok: boolean;
  payload?: unknown;
};

let server: ReturnType<typeof createServer> | null = null;
let lastChatGPTResult: ChatGPTCallbackResult | null = null;
let haxAuthCallbackHandler:
  | ((query: Record<string, string>) => Promise<HaxAuthCallbackResult>)
  | null = null;

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  body: unknown,
) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body, null, 2));
};

const sendHtml = (
  response: ServerResponse,
  statusCode: number,
  title: string,
  detail: string,
  payload: unknown,
) => {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
  });
  response.end(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 32px; background: #f6efe7; color: #2e1f11; }
          main { max-width: 640px; margin: 48px auto; padding: 24px; border-radius: 20px; background: white; box-shadow: 0 16px 40px rgba(46, 31, 17, 0.12); }
          h1 { margin-top: 0; }
          pre { white-space: pre-wrap; word-break: break-word; background: #f8f3ee; padding: 16px; border-radius: 12px; }
        </style>
      </head>
      <body>
        <main>
          <h1>${title}</h1>
          <p>${detail}</p>
          <pre>${JSON.stringify(payload, null, 2)}</pre>
        </main>
      </body>
    </html>
  `);
};

const getQuery = (request: IncomingMessage) => {
  const url = new URL(
    request.url ?? "/",
    `http://127.0.0.1:${ChatGPTCallbackPort}`,
  );
  return {
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
  };
};

const requestListener = async (
  request: IncomingMessage,
  response: ServerResponse,
) => {
  const { pathname, query } = getQuery(request);

  if (pathname === "/") {
    sendJson(response, 200, {
      ok: true,
      message: "Local auth server is running.",
    });
    return;
  }

  if (pathname === "/auth/debug") {
    sendJson(response, 200, { ok: true, lastChatGPTResult });
    return;
  }

  if (pathname === "/auth/callback") {
    const result = await handleChatGPTCallback(query);
    lastChatGPTResult = result;

    if (result.ok) {
      sendHtml(
        response,
        200,
        "ChatGPT auth completed",
        "You can go back to the app now.",
        result,
      );
      return;
    }

    sendHtml(
      response,
      400,
      "ChatGPT auth failed",
      result.error ?? "Unknown authentication error.",
      result,
    );
    return;
  }

  if (pathname === "/hax-auth/callback") {
    if (!haxAuthCallbackHandler) {
      sendHtml(
        response,
        503,
        "Hax desktop auth unavailable",
        "The desktop app is not ready to receive authentication callbacks.",
        query,
      );
      return;
    }

    const result = await haxAuthCallbackHandler(query);
    sendHtml(
      response,
      result.ok ? 200 : 400,
      result.ok ? "Hax desktop auth completed" : "Hax desktop auth failed",
      result.detail,
      result.payload ?? query,
    );
    return;
  }

  sendJson(response, 404, { ok: false, error: "Not found" });
};

export const setHaxAuthCallbackHandler = (
  handler:
    | ((query: Record<string, string>) => Promise<HaxAuthCallbackResult>)
    | null,
) => {
  haxAuthCallbackHandler = handler;
};

export const startAuthServer = async () => {
  if (server?.listening) {
    return server;
  }

  server = createServer((request, response) => {
    void requestListener(request, response).catch((error) => {
      sendJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server?.once("error", reject);
    server?.listen(ChatGPTCallbackPort, "127.0.0.1", () => resolve());
  });

  console.log(`Auth server running at http://127.0.0.1:${ChatGPTCallbackPort}`);
  return server;
};

export const stopAuthServer = async () => {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  server = null;
};
