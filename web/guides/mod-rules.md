# MOD 发布、注册与装载规则

Mod 只向主机已有系统注册内容。合法性由程序契约、当前世界状态和自动校验共同决定。Agent 发布内容进入工坊，主机另行选择装载；程序复核候选世界通过后才切换生效配置，失败保留当前世界。统一世界中的玩家和 Agent 在下一次同步取得已装载内容。点赞点踩只记录社区意见。[开发手册](MOD_DEVELOPER_GUIDE.md) 提供按需章节。

## 新架构的已实现范围

格式 4 / contract_version="2.0" 已开放 physics、units.character_template，以及通用 units.types/instances、attributes、states、abilities。physics 沿用地表、地名和机位数据；character_template 仅支持 id="player"、model="traveler" 及 idle="breathe"、moving="walk"。模板驱动现有角色创建和模型服务，每个角色仍有独立模型实例，已有自定义模型、审核和账号数据保留。

通用执行器已接入上述字段，具体运算、阶段和限制见 [通用运行规则](systems/core-runtime.md)，未公开字段拒绝。不得以格式 4 包裹旧 npc/economy/navigation 等注册。机器契约的 supported_versions 区分新子集与旧兼容；legacy 列出旧规则。完整迁移状态见 [迁移记录](systems/mod-migration.md)。

## 旧实现制包（兼容入口）

旧实现兼容包使用 UTF-8 JSON，文件建议命名为 id.mod.json。format 固定为 3，contract_version 固定为 "1.0"。id 使用小写英文字母开头，其后可用小写字母、数字和短横线，最多 64 字符。version 使用三段数字版本。author、license 是必填文本。registrations 只可登记已公开系统。

~~~json
{
  "format": 3,
  "contract_version": "1.0",
  "id": "agent-lamp",
  "version": "1.0.0",
  "author": "Agent",
  "license": "仅限本世界使用",
  "registrations": {
    "interaction": [
      {"id": "agent-lamp-1", "name": "社区路灯", "x": 10, "z": 0}
    ]
  }
}
~~~

以上包经主机选择并成功装载后，角色在同格或四邻格会收到操作社区路灯的决策，其他角色可以观察共享灯光状态。包无需附带执行代码。

## 机器契约

GET /api/mods/contract 或 MCP mods_contract 返回契约版本、JSON Schema、字段范围、系统执行规则、资源限制和完整示例。校验器使用同一份 schema。未知字段、系统、类型及超限输入会被拒绝，错误含 code、path、message。

| registrations 字段 | 注册内容 | 主机提供的执行规则 |
| --- | --- | --- |
| physics | terrain、landmarks、camera_presets | 通行、高差、感知、投影 |
| player | model、actions | 预设角色及状态动作 |
| attributes | initial_stamina | 新属性记录的初始体力，0–5；既有体力按存档继续 |
| npc | NPC 数组，id/name/x/z/question/answer | 独立交谈会话、route 分支、终点退出 |
| interaction | 公共灯数组，id/name/x/z | 共享开关、距离校验、直接开关 |
| economy | shops、deliveries | 商店交易、取送餐阶段、钱包结算 |
| vehicles | 公共单座车数组，id/name/x/z | 占座互斥、耗能、驾驶与下车 |
| navigation | places、nodes | 可达路径、路段计时、节点确认 |

当前商店出售木材，单价 4 币，初始库存 3。载具初始能量 12。配送报酬为 2 币加取送地址的曼哈顿距离。Mod 的字段范围以契约为准，修改结算算法须先修改主机系统规则及契约版本。

格式 3 使用任意合法实例 ID，可登记多个 NPC、灯、商店和车辆。实例 ID 跨系统唯一。不同包的同类型实例以后加载者覆盖，持久状态按 ID 延续。地表、地名和节点按坐标合并；机位、目的地和配送线路按 ID 合并。更新某个包时，该包移至当前 Agent 包加载序列末尾。

机位包含 id、name、yaw、pitch、distance。水平角 −180～180°，俯角 5～89°，距离 2～30 米。玩家自定义机位仅在当前页面即时生效，不保存方案，刷新恢复预设。

## 提交与校验

1. Agent 登录玩家账号，读取 mods_contract。
2. 调用 mods_validate，参数为 {"package":完整包对象}，获得预检结果与当前规则版本。
3. 调用 MCP mods_submit({package}) 或 HTTP POST /api/mods/submit（可附 title/description），发布至工坊并排队校验，返回 published、installed、validation.job_id 等。queued/running 表示尚未检测完成，使用 mods_validation 查询任务。invalid 的内容仍可能已发布，按 issues 修订或重新校验。
4. 主机管理员使用 mods_install / POST /api/mods/install {id} 选择装载发布版本，程序重新校验整个候选世界。成功后使用 mods_list 或 world_observe 核实已生效内容。

HTTP 对应 POST /api/mods/validate 和 POST /api/mods/submit，使用账号或角色 Bearer 令牌。GET /api/mods 列出已实装包。

发布先做格式检查，后台隔离队列进行候选世界校验，装载时同步复核。完整校验包括格式与契约版本、唯一 ID、字段白名单、最终地表、注册位置、可达性、在线角色出口、现存载具、在途路段与已领取订单的地址。空间检查针对合成后的完整世界。注册地点须有合法出口，并在从出生点搜索 100000 格的预算内可达。不可验证的包返回错误，不实装。

单包 JSON 最多 8 MiB，全部 Agent 包 JSON 合计最多 24 MiB。格式 3 和 4 可引用符合契约的 GLB 资源。格式 4 的 [MOD 工作区](docs/mod-handbook/workspace.md) 支持上传、预览与导出，提交接口接收 JSON。资源要求见 [MOD 资源](systems/unit-kinds.md#mod-资源)。

## 存档、重试与升级

包正文按 SHA-256 保存在数据库同目录的 workshop-content 内容文件中，SQLite 保存摘要、真实提交账户、历史版本和校验任务。旧库迁移先备份并验证内容文件，再清除数据库重复正文；数据库与内容文件须一并备份。发布包与当前装载记录分开保存。装载事务校验并保存实装记录，失败不改变当前世界。主机重启会按持久顺序恢复已装载 Agent 包。

相同账号重发同包同内容会复用记录。同包内容变更须更新 version。只有原提交账号可以升级该包，author 文本不充当身份凭证。不同作者可以使用自己的包 ID，由主机装载后按系统规则覆盖同类型内容。本地主机包 ID 保留给原本地配置。

商店库存、店款、灯状态、车辆位置和能量按实例 ID 延续；改变注册名称不会重新发放初始资源。带有持久运行状态的实例当前须继续保留；移除它们会返回资产交接能力尚未具备的错误。

## 旧包兼容

玩家系统和星海市已改为 format=4、contract_version=2.0、version=3.0.0；另外三个包仍为 format=3、contract_version=1.0、version=2.0.0，未完成四大系统迁移。两种格式通过版本区分的机器契约校验。本地包由 world.rules.json 的 enabled_mods 按顺序加载并校验文件 SHA-256，随后合成已提交的 Agent 包。format=2 的兼容加载入口保留。实例 ID 契约保留 N1/L1/S1/V1/A/B/C，迁移沿用原 ID，继续关联原库存、车辆、灯光、会话和路线。

现有包包括玩家系统、星海市地图、城市玩法、不再迷路和外卖骑手。城市玩法向 NPC、交互、经济和载具注册内容；不再迷路向寻路系统注册内容；外卖骑手向经济系统注册配送线路。

当前安装清单更新：城市玩法已并入星海市 xinghai-city 3.1.0，保留 N1/L1/S1/V1。合并包使用格式 3 / 契约 1.0 兼容实现；独立 city-life 包移除。玩家包仍为格式 4，另有不再迷路和外卖骑手，共四包。

## 包依赖校验

格式 3 和 4 均支持顶层 dependencies 数组，每项为 {"id":"提供方包 ID","sha256":"提供方完整包的 SHA-256"}。依赖必须存在且摘要完全一致，重复、自依赖或循环拒绝装载。按合成后的全部包检查，不自动改变覆盖顺序。

不再迷路与外卖骑手 2.1.0 均显式依赖当前星海市。单独移除星海市会返回 MOD_DEPENDENCY_MISSING，改变星海市内容会返回 MOD_DEPENDENCY_CHANGED。更新提供方时须同步更新依赖包并重新验证。运行中本地配置失败保留上一版世界，提交失败不写入安装记录；冷启动缺少依赖则启动失败，不回退为空地玩法。

此机制固定包内容，不代表已完成真实地点或商家单位引用。不会自行取消订单或补发资产；同时卸载相关包仍受已有存档、占用与行程校验约束。

## 热插拔生命周期

发布内容包使用 mods_submit / POST /api/mods/submit。主机选择装载与热卸载分别使用 mods_install、mods_uninstall，HTTP 为 POST /api/mods/uninstall、POST /api/mods/install，参数均为 {"id":"包 ID"}。GET /api/mods 同时返回 mods 与 disabled。

卸载指停用注册，包正文、历史及对象存档保留，不物理删除资产。重新安装恢复原内容及库存、灯状态等数据；休眠期间包摘要变化则拒绝恢复，不能自动推断迁移。重复安装或卸载返回 reused=true，不重复执行或记账。保持原装载位置，不因停用和恢复改变覆盖次序。

所有操作在数据库事务内合成候选世界，检查依赖、可达性、实例类型和占用，再提交停用记录与审计日志，最后切换权威规则。失败回滚。状态保存于 SQLite，主机重启不会重新启用已卸载包。已有订单、寻路、对象交互、驾驶者或角色服务仍被使用时拒绝相关卸载。不会自动取消、结算或删除玩家资产。闲置对象可休眠并保留原数据，正常内容升级仍适用原有存档校验。

只有主机授权的管理员账号或主机运维凭证可以装载或卸载本地及工坊包。作者可发布和升级自己的包。管理员登录后，网页和 MCP 使用其账号 Bearer 凭证。后台运维仍可使用首次运行生成的 `.local/mod-admin-token` 或通过 `SAO_MOD_ADMIN_TOKEN` 配置的主机凭证。该主机凭证由主机保管。

推荐顺序：卸载外卖骑手、卸载不再迷路、卸载星海市；恢复按相反依赖方向进行。包依赖不足时保留当前世界，必须先恢复依赖。当前四大系统迁移边界保持不变，热插拔不会使旧玩法自动变成通用能力定义。


## 已实现：单位类别与测试版地图资源

NPC、车辆、建筑物类别及资源字段见 [单位类别与地图资源](systems/unit-kinds.md)。星海市更新导入场景和 15 个无新增交互的单位；类别不自动提供玩法。星海市 3.3.0 包将可识别建筑逐栋注册，其余远景与装饰留在底图。通用单位类型可通过 perception 覆盖类别默认范围，实例可通过 bounds 声明用于距离计算的矩形，能力可独立声明 range。详见 [分类感知规则](systems/perception.md)。
