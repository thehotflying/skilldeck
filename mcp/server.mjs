// SkillDeck Codex widget — P5 safe mode.
// The widget intentionally does not scan local folders or send follow-up messages.
// A governed widget will be reconnected to the same catalog in P6.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineWidget, registerWidgetResource, readText } from './lib/widget-resource.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDGET_URI = 'ui://widget/skilldeck/deck.html';
const SAFE_MODE_MESSAGE = 'P5 安全模式：Codex widget 尚未接入技能管理中心统一库存。请在本地浏览器打开 SkillDeck；widget 不扫描目录、不读取 Skill 正文，也不会向会话发送执行命令。';

function widgetHtml() {
  return inlineWidget({
    html: readText(__dirname, 'widget', 'index.html'),
    css: readText(__dirname, 'widget', 'ui.css'),
    js: readText(__dirname, 'widget', 'ui.js'),
  });
}

const server = new McpServer({ name: 'skilldeck', version: '0.2.2' });

registerWidgetResource(server, {
  name: 'skilldeck-widget',
  uri: WIDGET_URI,
  title: 'SkillDeck（P5 安全模式）',
  description: '治理中心接入前的安全占位 widget：不扫描本地目录、不读取 Skill 正文、不发送会话命令。',
  html: async () => widgetHtml(),
});

registerAppTool(
  server,
  'open_skilldeck',
  {
    title: '打开 SkillDeck 技控台',
    description: '打开 P5 安全模式提示。真正的治理卡片墙请使用本地 SkillDeck 页面；widget 当前不读取技能库存或执行任何动作。',
    inputSchema: { dir: z.string().trim().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      ui: { resourceUri: WIDGET_URI, visibility: ['model', 'app'] },
      'ui/resourceUri': WIDGET_URI,
      'openai/outputTemplate': WIDGET_URI,
      'openai/widgetAccessible': true,
      'openai/toolInvocation/invoking': '打开 SkillDeck…',
      'openai/toolInvocation/invoked': 'SkillDeck 安全提示已打开',
    },
  },
  async () => ({
    content: [{ type: 'text', text: SAFE_MODE_MESSAGE }],
    structuredContent: { safe_mode: true, skills: [], error: SAFE_MODE_MESSAGE },
    _meta: { 'openai/outputTemplate': WIDGET_URI, widgetData: { safe_mode: true, skills: [], error: SAFE_MODE_MESSAGE } },
  })
);

server.registerTool(
  'list_skills',
  {
    title: 'List Skills（安全模式）',
    description: 'P5 不读取任何目录。等待 P6 接入技能管理中心统一库存。',
    inputSchema: { dir: z.string().trim().optional() },
    _meta: { 'openai/widgetAccessible': true },
  },
  async () => ({ content: [{ type: 'text', text: SAFE_MODE_MESSAGE }], structuredContent: { safe_mode: true, skills: [], error: SAFE_MODE_MESSAGE } })
);

const transport = new StdioServerTransport();
await server.connect(transport);
