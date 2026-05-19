#!/usr/bin/env node
/**
 * 直接通过飞书 API 发送消息
 * 用法: node send-feishu-notification.js "消息内容" ["chat_id"] ["root_message_id"]
 *
 * 必需环境变量:
 *   FEISHU_APP_ID
 *   FEISHU_APP_SECRET
 *
 * 可选环境变量:
 *   FEISHU_DEFAULT_CHAT_ID
 */

let sendFeishuFromArgv;

try {
  ({ sendFeishuFromArgv } = require('../dist/src/integrations/notifications/feishu'));
} catch {
  console.error('Missing compiled Feishu integration module. Run `npm run build` first.');
  process.exit(2);
}

(async () => {
  try {
    const result = await sendFeishuFromArgv(process.argv.slice(2), process.env);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(/Missing required environment variable|Missing chat_id/.test(message) ? 2 : 1);
  }
})();
