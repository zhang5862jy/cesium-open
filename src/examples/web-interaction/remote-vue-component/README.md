# 远程 Vue 组件的三层零信任加载

本示例参考“隔离边界、依赖契约、安全审计”三层思路，但明确区分样式隔离和
JavaScript 安全边界：Shadow DOM 只能隔离 DOM/CSS，`with + Proxy` 也不能可靠
约束恶意 JavaScript。因此默认模式不运行任何远程代码。

## 第一层：隔离边界

- 每个组件由 `RemoteComponentBoundary.vue` 创建独立 ShadowRoot；
- 组件 CSS 由宿主持有并注入影子根节点，不接受远程 `<style>`；
- 宿主只能通过 `::part(container|metric|action|primary-action)` 定制显式暴露区域；
- Vue 子应用、MutationObserver 和审计定时器由边界统一创建并在卸载时清理；
- 远程文件的 `<script>` 只能是 `application/json` manifest，不能包含 JavaScript。

## 第二层：版本和依赖契约

manifest 必须声明：

- `protocolVersion`：当前宿主仅接受 `1.0`；
- `dependencies.vue`：闭开版本范围；XML 文件中写为 `>=3.5.0 &lt;4.0.0`，
  解析后的 JSON 值为 `>=3.5.0 <4.0.0`；
- `capabilities`：最小权限清单，例如 `counter:read`；
- `limits`：每秒 DOM 变更和每分钟能力调用预算。

远程文件不携带 Vue 副本。宿主使用自己的 Vue 运行时创建子应用，并通过
`provide(REMOTE_RUNTIME_KEY, bridge)` 注入受控能力。版本或协议不匹配时直接拒绝；
兼容适配只能进入经过审计的显式适配器注册表，不允许运行时静默生成代码。

## 第三层：静态扫描、能力授权和行为审计

- 使用严格 XML 解析得到 AST，不使用 HTML 自动纠错；
- 只接受 6 种 `remote-*` 标签，并校验属性、枚举、父子关系、深度和节点总量；
- 拒绝事件属性、Vue 指令、远程样式、普通 `<script>`、未知 manifest 字段；
- URL、来源、HTTPS、重定向、响应类型、体积、UTF-8 和 SHA-256 逐层校验；
- 宿主逐项核对能力清单，未授权能力返回 `CAPABILITY_DENIED`；
- ShadowRoot 内的 MutationObserver 统计 DOM 变更，能力桥记录动作频率；
- 超出 manifest 声明预算时立即卸载子应用并展示熔断占位符。

远程网络请求和定时器始终显示为 0，不是因为 Proxy 拦截，而是因为协议从结构上
不允许远程 JavaScript，组件没有获得 `fetch`、`window` 或计时器入口。

## 必须运行任意第三方 SFC 时

不要把它编译后挂进主应用，也不要把 Proxy 当作安全沙箱。应把已构建产物放在
独立来源，通过 `sandbox` iframe、严格 CSP 和经过 schema 校验的 `postMessage`
协议通信。Shadow DOM 可继续用于样式隔离，但不能替代 iframe 的权限隔离。
