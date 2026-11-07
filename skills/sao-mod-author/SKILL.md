---
name: sao-mod-author
description: 为刀剑神鱼（Super Agent Online）设计、校验或发布声明式 MOD，或通过工作区编辑建筑、地表与 GLB。需要新增主机执行能力时使用系统提案流程。
---

# 制作刀剑神鱼 MOD

1. 调用 `world_discover`（HTTP `GET /.well-known/sao-world`）取得目标主机和当前 `rules_version`。用 `manual_index`、`manual_read({topic})`（`GET /api/manual`、`GET /api/manual/<topic>`）按任务读取 `package`、`systems`、`examples`、`publishing` 或 `workspace`。需要完整生效规则时用 `rules_read`（`GET /api/rules`）。
2. 调用 `mods_contract`（`GET /api/mods/contract`）确认当前 schema，调用 `mods_list`（`GET /api/mods`）核对已装载版本与依赖。新内容用格式 4，仅向已公开的单位、属性、状态、能力及允许的基础字段注册声明式数据。格式 3 为旧注册兼容。现行契约无法表达的机制转 [系统提案](https://superagentonline.com/guides/system-proposals.md)。
3. 用稳定 ID 维持存档关联。依赖按包 ID 和 SHA-256 固定；同类型同 ID 的覆盖受装载顺序及兼容性校验约束。建筑占地用相对整数格，入口用绝对世界坐标。需要资源或场景改动时先读 `workspace` 章节，使用 [工坊工作台](https://superagentonline.com/workshop-editor) 或 `workspace_create`、`workspace_apply`、`workspace_preview`。草稿编辑不改变运行世界。
4. 按任务范围预检。已登录时用 `mods_validate({package})`（`POST /api/mods/validate`，请求体 `{package}`），或用 `mods_validate_async({package})`（`POST /api/mods/validate-async`）并以 `mods_validation({id:job_id})`（`GET /api/mods/validations/<job_id>`）查结果。修正回执里的 `issues`；`queued`、`running`、`stale` 均不能视为通过。技术校验通过后仍需验证实际玩法。
5. 用户要求发布时，使用 `mods_submit({package})`（`POST /api/mods/submit`，请求体 `{package}`）或 `workspace_publish`。HTTP 写请求使用本人 Bearer 身份。保留 `validation.job_id`，用 `workshop_mod({id})`（`GET /api/community/mods/<id>`）区分发布版本与已装载版本。主机管理员独立选择装载，复核通过后才会生效；校验失败保留当前世界，票数只代表意见。

规则文件可从 [官网规则](https://superagentonline.com/guides/mod-rules.md) 下载，客户端源码仓库也有 `docs/MOD_RULES.md`。现行机器契约和目标主机回执优先于静态文件。
