# cfnew 与 edgetunnel 客户端规则组合说明

本 fork 的 `_worker.js` 以 [byJoey/cfnew 的明文源吗](https://github.com/byJoey/cfnew/blob/main/明文源吗) 为主体，接入 [cmliu/edgetunnel 的 _worker.js](https://github.com/cmliu/edgetunnel/blob/main/_worker.js) 中的订阅转换配置和客户端兼容处理。

组合范围是客户端完整配置：DNS、策略组、分流规则和格式兼容处理。节点生成、面板、鉴权、KV 配置、WebSocket/xhttp 转发以及服务端出站逻辑继续由 cfnew 提供。本文件不是两份 Worker 的直接拼接，也不会自动同步上游更新。

## 两个项目各自负责什么

| 功能 | 来源及组合方式 |
| --- | --- |
| 优选地址、节点命名、VLESS/Trojan/xhttp 链接 | cfnew 原有生成流程 |
| UUID/自定义路径订阅、面板、KV、鉴权、转发 | cfnew 主体 |
| 完整客户端配置转换 | edgetunnel 的 SUBAPI、SUBCONFIG 及默认转换选项 |
| Clash DNS/ECH、Sing-box 配置迁移 | 从 edgetunnel 提取的兼容补丁；适配真实节点凭据及非 TLS 节点 |
| Surge 托管订阅及 Trojan WS 兼容 | 参考 edgetunnel 处理方式，按 cfnew 每个节点恢复路径 |

默认模板为 cmliu/ACL4SSR 的 `ACL4SSR_Online_Mini_MultiMode_CF.ini`。实际规则来自所配置模板和转换服务的输出；修改 SUBCONFIG 会改变规则。这里采用的是本次集成时的上游处理方式，不保证永远与后续 edgetunnel 版本完全一致。

## 订阅数据流

1. 客户端访问 cfnew 原订阅地址。
2. cfnew 验证原有 UUID/自定义路径，并按原配置生成真实节点链接。
3. 原始节点请求直接返回 Base64 或 URI 列表，不进入外部转换。
4. 完整配置请求调用 SUBAPI，把同一订阅路径的 `target=base64` 地址与 SUBCONFIG 模板交给转换服务。
5. 转换服务回取原始订阅，再输出客户端配置；Worker 应用对应兼容补丁并返回结果。

显式 `target=base64` 优先于 User-Agent 识别，因此转换服务回取不会再次触发转换。不会套用 edgetunnel 的占位 UUID/Host 全局替换，避免破坏 cfnew 的真实 UUID、Trojan 密码、Host、SNI 及传输参数。

## 部署和配置

使用仓库根目录的 `_worker.js` 部署，继续按原 cfnew README 配置 Cloudflare Workers/Pages、兼容日期、环境变量及 KV。原仓库的明文/混淆文件是上游版本，部署组合版本时请选择 `_worker.js`。

保留原部署域名和 `u`/`d`，即可继续使用 `https://你的域名/<UUID>/sub` 或 `https://你的域名/<自定义路径>/sub`。不会改为 edgetunnel 的 `/sub?token=...` 地址。

| 配置 | 默认值及说明 |
| --- | --- |
| `scu` / `SCU` | `https://SUBAPI.cmliussss.net/sub`，可填写转换服务根地址或 `/sub` 地址 |
| `SUBCONFIG` / `subconfig` | `https://raw.githubusercontent.com/cmliu/ACL4SSR/refs/heads/main/Clash/config/ACL4SSR_Online_Mini_MultiMode_CF.ini` |
| 原有 cfnew 配置 | 继续使用 `u`、`d`、`C/c`、优选地址及协议开关等 |

已有 KV 配置优先于环境变量；尤其已有 `scu` 会继续使用原来的转换服务。SUBCONFIG 可通过环境变量设置，也可使用 cfnew 的配置 API 保存 KV `subconfig`；未新增单独面板控件。

转换默认选项：`emoji=false`、`list=false`、`scv=false`、`xudp=false`、`udp=false`、`tls13=false`、`append_type=false`、`sort=false`、`expand=true`。转换服务会收到订阅地址并可获取真实节点凭据，请配置可信服务。

## 客户端格式

在原订阅地址后添加查询参数：

| 参数 | 返回内容 |
| --- | --- |
| `target=base64` | 原始节点 Base64，保持 cfnew 节点生成 |
| `target=mixed` | 明文节点 URI 列表 |
| `target=clash` / `stash` / `meta` | Clash 类完整 YAML 配置 |
| `target=singbox` / `sing-box` | Sing-box 完整 JSON 配置 |
| `target=surge` | Surge 4 完整配置及托管订阅地址 |
| `target=quanx` / `quantumult` | Quantumult X 配置 |
| `target=loon` | Loon 配置 |

未指定 target 时识别 Clash/Mihomo/Stash、Sing-box、Surge、Quantumult X、Loon 的 User-Agent；其他情况默认 Base64。纯节点订阅本身不携带完整分流规则。

## 失败处理和限制

转换服务异常、超时、空内容或不符合对应完整配置结构时返回 HTTP 502，不回落到 cfnew 原规则。客户端对 VLESS/Trojan/xhttp、IPv6、ECH 的支持仍取决于自身及转换服务能力。

cfnew 家宽链式 `vg` / `jk` / `jiakuang` 尚未接入这一转换流程，明确返回 HTTP 422；普通客户端订阅不受此限制。

## 验证记录

本地执行 `node --check _worker.js` 及模拟测试，验证了原始节点与参考 cfnew 输出一致、转换回取不循环、客户端识别、自定义路径、ECH 补丁、Sing-box 迁移、非 TLS 节点保持以及错误响应。用户已反馈 `_worker.js` 测试通过；具体部署平台和客户端覆盖范围未在此记录，不能据此推断所有协议/客户端组合均已通过。

后续更新上游时，重点复核节点 URI 与传输参数、订阅入口/鉴权、转换默认选项和客户端兼容补丁，并再次测试各实际启用协议。
