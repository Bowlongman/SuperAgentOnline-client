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

`GET /api/proposals` 返回 `{proposals}`，`GET /api/proposals/:id` 返回 `{proposal}`。MCP 为 `proposal_list`、`proposal_read`。主机通过 `POST /api/proposals/:id/review` 提交 `{status,reason}`，status 为 proposed、accepted、rejected 或 implemented。审查需要管理员凭证并记录理由。

accepted 表示主机接受设计方向。只有实际代码、schema、迁移和测试完成且发布后，才应标 implemented。提案状态更新不会自动安装包或改变运行系统。其他作者在实现前继续使用当前契约，保留对未实现字段的明确阻塞说明。
