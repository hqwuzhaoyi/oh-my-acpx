export type FeishuConfig = {
  appId: string;
  appSecret: string;
  defaultChatId: string;
};

export type ResolvedFeishuMessage = {
  message: string;
  chatId: string;
  rootId: string;
};

export type FeishuHttpRequest = {
  hostname: string;
  path: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
};

export type FeishuJsonPost = (request: FeishuHttpRequest) => Promise<Record<string, any>>;

function requireEnv(name: string, value: string | undefined): string {
  if (value) {
    return value;
  }

  throw new Error(`Missing required environment variable: ${name}`);
}

export function getFeishuConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): FeishuConfig {
  return {
    appId: requireEnv("FEISHU_APP_ID", env.FEISHU_APP_ID),
    appSecret: requireEnv("FEISHU_APP_SECRET", env.FEISHU_APP_SECRET),
    defaultChatId: env.FEISHU_DEFAULT_CHAT_ID ?? ""
  };
}

export function resolveFeishuMessage(
  argv: string[],
  config: Pick<FeishuConfig, "defaultChatId">
): ResolvedFeishuMessage {
  const message = argv[0] || "测试消息";
  const chatId = argv[1] || config.defaultChatId;
  const rootId = argv[2] || "";

  if (!chatId) {
    throw new Error("Missing chat_id. Pass it as argv[3] or set FEISHU_DEFAULT_CHAT_ID.");
  }

  return { message, chatId, rootId };
}

export function buildFeishuMessageBody(
  chatId: string,
  message: string,
  rootId: string = ""
): Record<string, string> {
  const body: Record<string, string> = {
    receive_id: chatId,
    msg_type: "text",
    content: JSON.stringify({ text: message })
  };

  if (rootId) {
    body.root_id = rootId;
  }

  return body;
}

export function buildFeishuTokenRequest(config: Pick<FeishuConfig, "appId" | "appSecret">): FeishuHttpRequest {
  return {
    hostname: "open.feishu.cn",
    path: "/open-apis/auth/v3/tenant_access_token/internal",
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret
    })
  };
}

export function buildFeishuSendRequest(
  token: string,
  resolved: Pick<ResolvedFeishuMessage, "chatId" | "message" | "rootId">
): FeishuHttpRequest {
  return {
    hostname: "open.feishu.cn",
    path: "/open-apis/im/v1/messages?receive_id_type=chat_id",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(buildFeishuMessageBody(resolved.chatId, resolved.message, resolved.rootId))
  };
}

export function assertFeishuApiSuccess(result: Record<string, any>, tokenField?: string): string | Record<string, any> {
  if (result.code !== 0) {
    throw new Error(result.msg || "Feishu API request failed");
  }

  if (!tokenField) {
    return result;
  }

  const tokenValue = result[tokenField];
  if (!tokenValue || typeof tokenValue !== "string") {
    throw new Error(`Feishu API response missing expected field: ${tokenField}`);
  }

  return tokenValue;
}

export function createNodeFeishuJsonPost(): FeishuJsonPost {
  const https = require("node:https") as typeof import("node:https");

  return async (request: FeishuHttpRequest) =>
    new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: request.hostname,
          path: request.path,
          method: request.method,
          headers: request.headers
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch (error) {
              reject(error);
            }
          });
        }
      );

      req.on("error", reject);
      req.write(request.body);
      req.end();
    });
}

export async function sendFeishuNotification(
  config: Pick<FeishuConfig, "appId" | "appSecret">,
  resolved: Pick<ResolvedFeishuMessage, "chatId" | "message" | "rootId">,
  postJson: FeishuJsonPost = createNodeFeishuJsonPost()
): Promise<Record<string, any>> {
  const tokenResponse = await postJson(buildFeishuTokenRequest(config));
  const token = assertFeishuApiSuccess(tokenResponse, "tenant_access_token") as string;
  const sendResponse = await postJson(buildFeishuSendRequest(token, resolved));
  return assertFeishuApiSuccess(sendResponse) as Record<string, any>;
}

export async function sendFeishuTextFromEnv(
  args: {
    message: string;
    chatId: string;
    rootId?: string;
  },
  env: NodeJS.ProcessEnv = process.env,
  postJson: FeishuJsonPost = createNodeFeishuJsonPost()
): Promise<Record<string, any>> {
  const config = getFeishuConfigFromEnv(env);
  return sendFeishuNotification(
    config,
    {
      chatId: args.chatId,
      message: args.message,
      rootId: args.rootId ?? ""
    },
    postJson
  );
}

export async function sendFeishuFromArgv(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  postJson: FeishuJsonPost = createNodeFeishuJsonPost()
): Promise<Record<string, any>> {
  const config = getFeishuConfigFromEnv(env);
  const resolved = resolveFeishuMessage(argv, {
    defaultChatId: config.defaultChatId
  });

  return sendFeishuNotification(config, resolved, postJson);
}
