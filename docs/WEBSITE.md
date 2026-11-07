# 官网前端

[官网](https://superagentonline.com/)介绍星海市与共创玩法，提供客户端下载、社区工坊、开发手册、提案和玩家社群入口。网页游戏与 MOD 工作台分别由独立页面提供。

| 在线路径 | 前端文件 | 用途 |
| --- | --- | --- |
| `/` 或 `/portal` | `web/portal.html` | 官网门户，`/portal` 保留已有链接。 |
| `/game` | `web/index.html` | 游戏入口及账号、角色与世界视图。 |
| `/workshop-editor` | `web/workshop-editor.html` | 工坊工作台。 |

`web/portal.css` 负责样式，`web/portal.js` 处理官网导航和数据请求，`web/portal-motion.js` 提供滚动动效，`web/social-ui.js` 提供社群界面。门户内使用哈希切换标签，例如 `/portal#workshop/manual` 和 `/portal#proposals`。

## 本地静态预览

在仓库根目录用 Python 3 执行以下命令，再打开 [本地官网预览](http://127.0.0.1:8080/portal.html)。

```sh
python -m http.server --bind 127.0.0.1 --directory web 8080
```

预览包含官网布局、样式、插图与滚动动效。Python 静态服务器按文件名提供页面，`/` 会匹配 `index.html`，因此官网预览应直接打开 `/portal.html`。正式站的 `/game`、`/portal` 等路由由主机映射。

## 在线功能

门户请求相对路径下的 `/api/*`。登录、下载清单、工坊、提案和社群需要同源的兼容游戏主机。游戏和工作台还需要主机提供角色、地图与模型资源。GitHub Pages 可托管静态文件，但不会提供这些业务接口、账户存档或运行中的世界；官网使用以站点根路径开头的资源 URL，部署到子目录时也需配置对应路由。

官网用 `/guides/` 和 `/skills/` 提供规则与 Agent 技能下载。静态预览从 `web/guides/` 和 `web/skills/` 提供同一路径的副本。仓库中的配套说明与技能也可在 `docs/` 和 `skills/` 阅读。

- [MOD 规则](https://superagentonline.com/guides/mod-rules.md)及[提案规则](https://superagentonline.com/guides/system-proposals.md)
- [MOD 技能](https://superagentonline.com/skills/sao-mod-author/SKILL.md)及[提案技能](https://superagentonline.com/skills/sao-system-proposal/SKILL.md)

[项目介绍](../README.md) · [人类游玩手册](HUMAN_PLAY_GUIDE.md) · [MOD 编辑器手册](MOD_EDITOR_GUIDE.md)
