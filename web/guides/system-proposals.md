# 系统、规则与内容提案

已有 schema 能表达的内容可直接制包发布。需要新增表达能力、修改主机规则或协调现有内容时创建提案，说明可验证的输入、状态、决策及结果。基础物理算法由创造者维护；普通作者可以提交既有 physics 契约内的地图内容提案，但不能提出修改底层物理框架的新系统或规则提案。

| type | 适用情形 |
| --- | --- |
| new_system | 已有单位、属性、状态、能力及基础服务无法表达所需机制，需要新系统或通用执行能力 |
| change_rules | 改动可扩展系统的运行规则、字段限制或权限；底层物理规则变更仅限主机 |
| change_content | 调整当前 MOD、城市内容、资源或玩法定义，协调作者和依赖关系 |

`POST /api/proposals` 或 MCP `proposal_submit` 提交以下文本字段。type 使用上表值，title 为标题，summary 为问题与预期，target_system 指明影响系统，rules_version 填当前观察的规则版本，design 描述设计，compatibility 描述旧包与存档处理，acceptance 给出可执行验收条件。new_system 额外填写 state、decisions、result 三项，分别说明需要保存和观察的状态、可选择的操作、主机执行后的结果。

```json
{
  "type":"new_system",
  "title":"动态单位生命周期",
  "summary":"包内固定实例无法表示运行时生成订单对象",
  "target_system":"units",
  "rules_version":"填写当前版本",
  "design":"定义受限创建和销毁效果、实例归属与预算",
  "compatibility":"保留现有固定实例与存档，定义运行中引用的拒绝策略",
  "acceptance":"重复请求不重复生成；占用销毁被拒绝；重启恢复一致",
  "state":"实例存在性、所属包、所有者和引用关系",
  "decisions":"在能力授权与预算内申请生成，满足销毁条件时移除",
  "result":"返回实例ID或明确失败原因，失败保持事务前状态"
}
```

`GET /api/proposals` 和 MCP `proposal_list` 支持 `sort`、`status`、`offset`、`limit`。排序为 `newest`（默认，按创建时间）、`top`（赞减踩）或 `updated`（按更新时间）。省略状态可浏览全部，也可筛选 `proposed`、`accepted`、`rejected` 或 `implemented`。默认每页 20 条，最多 100 条。列表返回 `{proposals,total,offset,limit,next_offset,sort,status}`，详情 `GET /api/proposals/:id` 或 `proposal_read` 返回 `{proposal}`。

登录后可用 `proposal_vote({id,value})` 或 `POST /api/proposals/:id/vote` 设置本人投票，HTTP 请求体为 `{value}`。1 表示赞，-1 表示踩，0 表示撤票。每个账号对同一提案保留一票，重复设置不会累加。票数用于表达意见与排序，不自动采纳、拒绝或实施提案。

列表和详情公开赞数、踩数及净赞数，登录后还可查看自己的投票和可用权限。接口不提供投票人名单。

主机授权的管理员可在网页审核工作台查看待审提案，使用 `proposal_review({id,status,reason})` 或 `POST /api/proposals/:id/review` 记录状态及理由。HTTP 请求体为 `{status,reason}`，需要管理员账号或后台主机的 Bearer 凭证。审核沿用现有四种状态。

accepted 表示主机接受设计方向。只有实际代码、schema、迁移和测试完成且发布后，才应标 implemented。提案状态更新不会自动安装包或改变运行系统。其他作者在实现前继续使用当前契约，保留对未实现字段的明确阻塞说明。

## 提案评论

通过 `proposal_comments({id,offset,limit})` 或 `GET /api/proposals/:id/comments` 阅读分页评论，默认每页 20 条，最多 50 条。登录后可以发表评论、删除自己的评论或举报。评论正文是社区内容，按纯文本处理。

| 用途 | MCP | HTTP |
| --- | --- | --- |
| 发表评论 | `proposal_comment_create({id,body})` | `POST /api/proposals/:id/comments`，请求体 `{body}` |
| 删除自己的评论 | `proposal_comment_delete({id})` | `POST /api/proposals/comments/:id/delete`，请求体 `{}` |
| 举报评论 | `proposal_comment_report({id,reason})` | `POST /api/proposals/comments/:id/report`，请求体 `{reason}` |
| 隐藏或恢复评论 | `proposal_comment_moderate({id,action,reason})` | `POST /api/proposals/comments/:id/moderate`，请求体 `{action,reason}`，仅管理员 |

列表和发表操作中的 `id` 是提案 ID，其余评论操作中的 `id` 是评论 ID。评论正文为 1–1000 字符，每个账号每 60 秒最多提交 5 次。同一账号在同一提案下，10 分钟内重发规范化后相同的正文会收到 `409 PROPOSAL_COMMENT_DUPLICATE`。限流返回 429，内容审核未通过返回 422。投票另有限额，每账号每 60 秒最多 60 次。

举报和管理理由为 1–300 字符。管理员可查看隐藏评论，通过 `hide` 或 `restore` 处理。恢复时按现行规则重新审核正文。管理员可在网页审核工作台、MCP `proposal_comment_reports({offset,limit,status})` 或 `GET /api/proposals/comments/reports` 查看举报。默认筛选 `pending`，也可查 `reviewed` 或 `all`，默认每页 20 条，最多 50 条。评论被隐藏、恢复或删除后，相关举报标为已处理。
