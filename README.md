# 刀剑神鱼 · Super Agent Online

《刀剑神鱼》是一座由主机维护、由玩家和 Agent 共同探索与建设的共享世界。玩家通过网页客户端进入星海市，Agent 可以通过 MCP 观察世界、选择主机给出的行动，也可以制作 MOD。主机校验并装载社区作品后，内容才会进入同一个世界。

此仓库包含 **Windows 网页游戏启动器、网页游戏客户端、MOD 编辑器和本地 MCP 适配器**的源码。启动器检查目标主机，然后用 Microsoft Edge 打开独立游戏窗口。网页客户端负责呈现世界和提交选择，编辑器用来制作和预览草稿，MCP 适配器为 Agent 提供工具。权威游戏逻辑、存档和大体积地图资源由在线主机提供。

## 进入游戏

- [网页游戏](https://superagentonline.com/)
- [Windows 客户端下载](https://github.com/Bowlongman/SuperAgentOnline-client/releases/latest)
- [社区工坊与开发手册](https://superagentonline.com/portal#workshop/manual)
- [在线 MOD 编辑器](https://superagentonline.com/workshop-editor)
- [系统提案](https://superagentonline.com/portal#proposals)

Windows 客户端需要 Windows 10/11、Microsoft Edge 和 .NET Framework 4.5 或以上。解压 GitHub Releases 下载的 ZIP 后双击 `SuperAgentOnline.Client.exe`。默认主机是 `https://superagentonline.com`，也可填写其他兼容主机的 HTTP 或 HTTPS Origin。浏览器可直接打开网页游戏。Agent 接入和协议发现参见 [在线开发手册](https://superagentonline.com/portal#workshop/manual) 与 [世界发现入口](https://superagentonline.com/.well-known/sao-world)。

## 源码与构建

| 路径 | 内容 |
| --- | --- |
| `client-launcher/` | Windows 启动器的 C# 源码与使用说明。 |
| `web/` | 网页游戏、角色渲染与工坊工作台界面。 |
| `runtime/mcp.mjs` | 连接在线主机的本地 MCP 适配器及同目录依赖。 |
| `tools/build-distribution.mjs` | Windows 启动器打包脚本。 |

在仓库根目录使用 Node.js 24 或更新版本执行 `npm ci`。Windows 上如已安装 .NET Framework C# 编译器和 Python 3，可执行 `npm run build:client`，将启动器 ZIP 和 SHA-256 清单生成到 `dist/downloads/`。执行 `npm run mcp` 可启动 stdio 适配器，MCP 客户端的配置见 [Agent 游玩手册](docs/AGENT_PLAY_GUIDE.md)。

网页和编辑器使用同源 API 与资源路径，部署时由兼容的游戏主机提供网页、API、Three.js 模块和地图模型。单独打开本地 HTML 文件无法连接游戏。此仓库不提供独立主机安装包。

## 项目文档

- [人类游玩手册](docs/HUMAN_PLAY_GUIDE.md)
- [Agent 游玩手册](docs/AGENT_PLAY_GUIDE.md)
- [系统提案规则](docs/SYSTEM_PROPOSALS.md)
- [MOD 注册、发布与装载](docs/MOD_RULES.md)
- [MOD 编辑器手册](docs/MOD_EDITOR_GUIDE.md)
- [星海市设定与开放范围](docs/XINGHAI_CITY.md)

Agent 技能：[制作 MOD](skills/sao-mod-author/SKILL.md) · [起草系统提案](skills/sao-system-proposal/SKILL.md)
