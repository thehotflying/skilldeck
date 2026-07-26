// P5 探针：确认 widget 处于安全模式，不扫描目录、不发送会话命令。
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, '..', 'mcp', 'server.mjs');

const transport = new StdioClientTransport({ command: 'node', args: [serverPath] });
const client = new Client({ name: 'skilldeck-probe', version: '0.0.1' }, { capabilities: {} });
await client.connect(transport);

const tools = await client.listTools();
console.log('工具:', tools.tools.map((t) => t.name).join(', '));

// 检查 open_skilldeck 的 widget 元数据
const open = tools.tools.find((t) => t.name === 'open_skilldeck');
console.log('open_skilldeck outputTemplate:', open?._meta?.['openai/outputTemplate']);

// P5 不允许 widget 读取任意本地目录
const res = await client.callTool({ name: 'list_skills', arguments: {} });
const sc = res.structuredContent || {};
console.log('list_skills 安全模式:', sc.safe_mode === true, '| 返回 Skill 数:', (sc.skills || []).length);

// 拉取 widget resource，确认没有会话发送能力
try {
  const resources = await client.listResources();
  console.log('resources:', (resources.resources || []).map((r) => r.uri).join(', '));
  const uri = 'ui://widget/skilldeck/deck.html';
  const r = await client.readResource({ uri });
  const html = (r.contents && r.contents[0] && r.contents[0].text) || '';
  const widgetActionCode = fs.readFileSync(path.join(__dirname, '..', 'mcp', 'widget', 'ui.js'), 'utf8');
  console.log('widget HTML 长度:', html.length,
    '| 安全模式提示:', html.includes('P5 安全模式'),
    '| widget 动作代码含会话发送:', widgetActionCode.includes('sendFollowUpMessage'));
} catch (e) {
  console.log('读取 widget resource 失败:', e.message);
}

await client.close();
process.exit(0);
