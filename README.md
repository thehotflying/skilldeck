# SkillDeck · 技能管理中心可视化前台

SkillDeck 是现有“技能管理中心”的可视化前台，不是另一套技能库存。

- 卡片墙负责发现、搜索、筛选与临时专家组合；
- 技能管理中心负责来源、重复关系、风险等级、主版本建议与操作卡；
- 本页面只读取治理中心的统一库存，不能退回任意目录扫描。

## 当前可用能力

启动本地页面后，浏览：

```bash
node server.js
```

打开 `http://localhost:4177`，可以：

1. 查看卡片、来源、风险线索、重复关系和五类治理状态；
2. 搜索与筛选治理库存；
3. 为“可直接用”技能生成路径式调用指令；
4. 为普通确认门生成最小范围确认卡；
5. 为强确认门、待整理或去重项生成操作卡；
6. 建立仅在当前页面有效的临时专家组合；组合继承成员中的最高风险等级。

页面不会执行 Skill、读取 Skill 正文、删除技能、连接账号或启动自动化。

## 模型与隐私设置（P5）

模型配置是可选项；未配置时，浏览、治理、搜索和调用卡全部离线可用。

- API 地址、模型名称和用途范围仅保存为本地元数据：`.skilldeck.local.json`；
- API 密钥只写入 macOS 钥匙串，不写入 JSON、不显示在页面、不进入 Git；
- 默认允许范围仅为未来的“分类、推荐、摘要”；
- 完整 `SKILL.md`、内部/绝对路径、住民/员工/机构资料不会默认外发；
- 连通性测试必须在页面逐次勾选确认，只访问模型提供商的元数据端点，不发送任何 Skill 数据；
- 当前 P5 不启用外部模型分类，因而不会对外发送任何 Skill 列表或正文。

仓库中的 [.skilldeck.local.example.json](.skilldeck.local.example.json) 是无密钥的元数据示例。不要手工把密钥填进 JSON；请从页面的“模型与隐私设置”保存。

## Codex widget 状态

P5 中的 Codex widget 处于**安全模式**：不扫描本地目录、不读取 Skill 正文、不向会话发送命令。真正的可视化治理体验请使用本地页面。P6 才会把 widget 接到与本页面相同的治理中心统一数据契约，并单列做真实会话验收。

## 验证

```bash
node scripts/test-governance-adapter.js
node scripts/test-governance-invocation-policy.js
node scripts/test-model-config.js
python3 /Users/mac/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```

这些测试不写入 API 密钥、不启动外部连接、不修改正式技能库。
