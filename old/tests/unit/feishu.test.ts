import test from "node:test";
import assert from "node:assert/strict";

import {
  assertFeishuApiSuccess,
  buildFeishuMessageBody,
  buildFeishuSendRequest,
  buildFeishuTokenRequest,
  getFeishuConfigFromEnv,
  resolveFeishuMessage,
  sendFeishuFromArgv,
  sendFeishuTextFromEnv,
  sendFeishuNotification
} from "../../src/integrations/notifications/feishu";

test("getFeishuConfigFromEnv reads required values", () => {
  const config = getFeishuConfigFromEnv({
    FEISHU_APP_ID: "app-id",
    FEISHU_APP_SECRET: "app-secret",
    FEISHU_DEFAULT_CHAT_ID: "oc_demo"
  });

  assert.deepEqual(config, {
    appId: "app-id",
    appSecret: "app-secret",
    defaultChatId: "oc_demo"
  });
});

test("getFeishuConfigFromEnv throws on missing required values", () => {
  assert.throws(() => getFeishuConfigFromEnv({}), /FEISHU_APP_ID/);
});

test("resolveFeishuMessage falls back to default chat id", () => {
  const resolved = resolveFeishuMessage(["hello"], { defaultChatId: "oc_demo" });

  assert.deepEqual(resolved, {
    message: "hello",
    chatId: "oc_demo",
    rootId: ""
  });
});

test("resolveFeishuMessage throws when no chat id is available", () => {
  assert.throws(
    () => resolveFeishuMessage(["hello"], { defaultChatId: "" }),
    /Missing chat_id/
  );
});

test("buildFeishuMessageBody adds root_id only when present", () => {
  assert.deepEqual(buildFeishuMessageBody("oc_demo", "hello"), {
    receive_id: "oc_demo",
    msg_type: "text",
    content: "{\"text\":\"hello\"}"
  });

  assert.deepEqual(buildFeishuMessageBody("oc_demo", "hello", "root_1"), {
    receive_id: "oc_demo",
    msg_type: "text",
    content: "{\"text\":\"hello\"}",
    root_id: "root_1"
  });
});

test("buildFeishuTokenRequest builds the expected auth request", () => {
  assert.deepEqual(
    buildFeishuTokenRequest({
      appId: "app-id",
      appSecret: "app-secret"
    }),
    {
      hostname: "open.feishu.cn",
      path: "/open-apis/auth/v3/tenant_access_token/internal",
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{\"app_id\":\"app-id\",\"app_secret\":\"app-secret\"}"
    }
  );
});

test("buildFeishuSendRequest builds the expected message request", () => {
  assert.deepEqual(
    buildFeishuSendRequest("token-1", {
      chatId: "oc_demo",
      message: "hello",
      rootId: "root_1"
    }),
    {
      hostname: "open.feishu.cn",
      path: "/open-apis/im/v1/messages?receive_id_type=chat_id",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-1"
      },
      body: "{\"receive_id\":\"oc_demo\",\"msg_type\":\"text\",\"content\":\"{\\\"text\\\":\\\"hello\\\"}\",\"root_id\":\"root_1\"}"
    }
  );
});

test("assertFeishuApiSuccess returns token field or throws on API error", () => {
  assert.equal(
    assertFeishuApiSuccess({ code: 0, tenant_access_token: "token-1" }, "tenant_access_token"),
    "token-1"
  );

  assert.throws(
    () => assertFeishuApiSuccess({ code: 999, msg: "bad request" }),
    /bad request/
  );
});

test("sendFeishuNotification posts token request then message request", async () => {
  const calls: Array<{ path: string; body: string }> = [];

  const result = await sendFeishuNotification(
    {
      appId: "app-id",
      appSecret: "app-secret"
    },
    {
      chatId: "oc_demo",
      message: "hello",
      rootId: ""
    },
    async (request) => {
      calls.push({ path: request.path, body: request.body });
      if (request.path.includes("tenant_access_token")) {
        return { code: 0, tenant_access_token: "token-1" };
      }

      return { code: 0, data: { message_id: "msg-1" } };
    }
  );

  assert.equal(calls.length, 2);
  assert.match(calls[0].path, /tenant_access_token/);
  assert.match(calls[1].path, /messages/);
  assert.deepEqual(result, { code: 0, data: { message_id: "msg-1" } });
});

test("sendFeishuTextFromEnv resolves config from env and forwards the message", async () => {
  const calls: Array<{ path: string; body: string }> = [];

  const result = await sendFeishuTextFromEnv(
    {
      message: "hello",
      chatId: "oc_demo",
      rootId: "root_1"
    },
    {
      FEISHU_APP_ID: "app-id",
      FEISHU_APP_SECRET: "app-secret",
      FEISHU_DEFAULT_CHAT_ID: ""
    },
    async (request) => {
      calls.push({ path: request.path, body: request.body });
      if (request.path.includes("tenant_access_token")) {
        return { code: 0, tenant_access_token: "token-1" };
      }

      return { code: 0, data: { message_id: "msg-2" } };
    }
  );

  assert.equal(calls.length, 2);
  assert.match(calls[0].body, /app-id/);
  assert.match(calls[1].body, /oc_demo/);
  assert.match(calls[1].body, /root_1/);
  assert.deepEqual(result, { code: 0, data: { message_id: "msg-2" } });
});

test("sendFeishuFromArgv resolves env and argv together", async () => {
  const calls: Array<{ path: string; body: string }> = [];

  const result = await sendFeishuFromArgv(
    ["hello", "oc_demo", "root_1"],
    {
      FEISHU_APP_ID: "app-id",
      FEISHU_APP_SECRET: "app-secret",
      FEISHU_DEFAULT_CHAT_ID: ""
    },
    async (request) => {
      calls.push({ path: request.path, body: request.body });
      if (request.path.includes("tenant_access_token")) {
        return { code: 0, tenant_access_token: "token-1" };
      }

      return { code: 0, data: { message_id: "msg-3" } };
    }
  );

  assert.equal(calls.length, 2);
  assert.match(calls[1].body, /hello/);
  assert.match(calls[1].body, /oc_demo/);
  assert.match(calls[1].body, /root_1/);
  assert.deepEqual(result, { code: 0, data: { message_id: "msg-3" } });
});
