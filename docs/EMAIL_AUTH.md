# 邮箱验证码与腾讯云 SES

正式启用前先完成 SES 开通、发信域名验证、模板审核和真实收件验收。验收期间，公开主机保持邮箱验证码开关关闭，原有账号照常使用。测试应连接隔离主机和测试数据库。

## 腾讯云配置

2026 年 3 月 2 日起新开通 SES 的个人实名认证用户使用 API 或控制台发信，SMTP 不向这类新账号开放。服务端使用 SES 的 HTTPS `SendEmail` 接口处理验证码邮件。 [SMTP 发信指南](https://cloud.tencent.com.cn/document/product/1288/65749) · [SendEmail API](https://cloud.tencent.com/document/api/1288/51034)

1. 在腾讯云邮件推送控制台开通服务，记录实际发信地域。
2. 建议新建专用发信子域名 `mail.superagentonline.com`。根据控制台显示的记录名、类型和值配置 DNS，完成验证。MX、SPF、DKIM 和 DMARC 以该域名的控制台清单为准。 [发信域名](https://cloud.tencent.com/document/product/1288/55191)
3. 在验证后的子域名下创建发信地址，例如 `noreply@mail.superagentonline.com`。提交验证码模板，审核通过后记录模板 ID。 [腾讯云邮件配置](https://cloud.tencent.com/document/product/1288/47454)
4. 在服务端配置仅供 SES 发信使用的凭证。密钥只保存在受限的服务端配置中，避免把真实值写入仓库、MCP 配置、浏览器代码或日志。

## 验证码模板

验证码逻辑涉及 `code`、`purpose`（注册、登录或绑定）与 `expiry_minutes`。腾讯云普通发送的模板文档列明仅支持一个变量。项目只传 `code` 给 SES，正文用通用用途文案并固定为当前五分钟有效期。 [腾讯云发信模板](https://cloud.tencent.com/document/product/1288/55193)

> 你正在验证刀剑神鱼账号。本次验证码为 {{code}}，5 分钟内有效。

## 服务端配置

在主机环境文件中设置下列变量。发信服务用官方 Node.js SES SDK `tencentcloud-sdk-nodejs-ses`，凭证仅供服务进程读取。

| 变量 | 用途 |
| --- | --- |
| `SAO_EMAIL_AUTH_ENABLED` | 公开启用开关，验收前设为 `false`。 |
| `SAO_EMAIL_CODE_SECRET` | 至少 32 字符的高熵随机值，与 SES 密钥分开。 |
| `SAO_EMAIL_AUTH_TRUST_PROXY` | 默认 `false`。仅在受控本地反代覆盖 `X-Real-IP` 且应用只能由该反代或回环访问时启用。 |
| `SAO_SES_SECRET_ID`、`SAO_SES_SECRET_KEY` | 仅供服务端调用 SES 的密钥对。 |
| `SAO_SES_REGION` | 实际发信地域。香港示例为 `ap-hongkong`。 |
| `SAO_SES_FROM` | 控制台验证过的发件地址。 |
| `SAO_SES_TEMPLATE_ID` | 已审核模板的正整数 ID。 |

## 游戏端接口

| 用途 | MCP | HTTP |
| --- | --- | --- |
| 读取邮箱认证开关 | `auth_config` | `GET /api/auth/config` |
| 发送验证码 | `auth_email_send({email,purpose})` | `POST /api/auth/email/send` |
| 验证验证码 | `auth_email_verify({challenge_id,code,login?})` | `POST /api/auth/email/verify` |
| 查看当前账号邮箱 | `auth_email_status` | `GET /api/auth/email/status` |
| 退出当前账号 | `auth_logout` | `POST /api/auth/logout` |

`purpose` 可为 `register`、`login` 或 `bind`。注册验证时填新账号名 `login`。绑定需先用原账号登录，HTTP 发码和验码都用该账号的 Bearer 凭证。MCP 自动保存注册或登录返回的账号令牌。发码成功回执含 `challenge_id`、`retry_after_seconds` 和 `expires_in_seconds`。用户从邮箱取得六位验证码后提交，验证码作为字符串保留前导零。

启用邮箱验证码后，旧 `POST /api/register` 与 MCP `player_register` 返回 `EMAIL_REGISTRATION_REQUIRED`。既有账号的密码登录 `player_login` 仍可使用，登录后可走绑定流程。邮箱注册建立的账号使用邮箱登录。

退出请求发送空 JSON 对象及账号 Bearer 凭证。邮箱会话撤销后返回 `revoked:true`，旧密码身份返回 `revoked:false`。MCP 收到成功响应后均清除本地账号与角色身份。账号持有人自行从邮箱读取验证码，Agent 只使用其私下提供的验证码完成验证。

## 验收与启用

1. 在隔离环境配置真实 SES 凭证和已审核的模板，用获授权的测试邮箱触发发送并确认收到邮件。腾讯云返回消息 ID 表示已接受发送请求，实际收件仍需验证。 [SendEmail 返回参数](https://cloud.tencent.com/document/api/1288/51034)
2. 从收到的验证码验证注册、登录和旧账号绑定。确认错误码、过期及重复使用会被拒绝，旧账号绑定后仍能进入自己的原有角色。验收记录可保留发送请求 ID 和状态，避免记录邮箱完整地址、验证码及凭证。
3. 实测通过后再启用公开主机，并用公开认证配置核实开关状态。需要回退时先关闭该开关并重启主机，保留账号数据库和已绑定邮箱。
