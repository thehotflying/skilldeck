# SkillDeck vNext 治理档案契约 v1

## 目的

SkillDeck 前台只读取 `skill-plugin-control-center` 的实时只读输出；不得自行扫描 Skill 目录并维护第二套库存。

## 边界

- 唯一事实来源：`skill-plugin-control-center` 的 `search`、`treatment`、`duplicates` 输出。
- 前台默认不接收绝对路径、完整 `SKILL.md` 正文或账号信息。
- 治理中心读取失败时返回错误；不得回退到 SkillDeck 原有目录扫描。
- P2 只供浏览和筛选；`direct_execution_allowed` 固定为 `false`。

## 单项档案

| 字段 | 说明 |
| --- | --- |
| `stable_id` | 治理中心的“来源 + 相对路径”唯一标识 |
| `name` / `description` / `tags` | 展示与搜索信息 |
| `category` | 治理队列业务分类，缺失时为“未分类” |
| `source` / `source_layer` | 用户技能、Codex 本地技能或个人插件缓存 |
| `relative_path` | 可展示的相对路径 |
| `absolute_path` | 前台固定为 `null` |
| `treatment` | 五类治理状态、建议和下一步 |
| `risk_clues` / `evidence_level` | 静态线索与证据等级，不等同于真实行为 |
| `duplicate` | 同名/同 SHA 组；P2 不指定主版本 |
| `invocation` | P2 固定为不可直接执行 |

## 状态规则

| 治理状态 | P2 前台行为 |
| --- | --- |
| 待整理 | 查看信息与修复建议 |
| 去重处理 | 查看重复关系与主版本候选入口 |
| 普通确认门 | 显示风险；P4 后才可生成确认调用卡 |
| 强确认门 | 仅显示方案/操作卡；不得直接调用 |
| 可直接用 | P4 后才可生成路径调用卡 |

## 当前已知限制

- 当前治理队列为 478 条，其中普通确认门 206、强确认门 162、可直接用 110；待整理和去重处理当前为 0。
- 当前同名重复组 49 个、同 SHA 组 39 个；“同名”不证明可互换。
- 新会话发现、widget 消息送达和实际执行安全均不由本契约证明。

