# Cesium 示例库

基于 Vue 3、TypeScript、Vite 和 CesiumJS 的功能示例项目。

```bash
pnpm install
pnpm dev
```

## 示例显示

在 `src/examples/<分类>/<示例>/config.json` 中设置 `"visible": false`，即可从首页目录隐藏该示例。
分类的 `config.json` 可隐藏整个分类，`src/examples/config.json` 可隐藏全部示例。
省略 `visible` 时默认显示。隐藏的示例仍可通过原有链接直接打开。

## 代码检查与格式化

完整配置、检查器分工及内网迁移步骤见 [Oxlint、Oxfmt、ESLint 接入与内网迁移指南](docs/oxlint-oxfmt-eslint-migration.md)。

项目使用固定版本的 Oxlint、ESLint、eslint-plugin-vue、eslint-plugin-oxlint、@html-eslint/eslint-plugin 和 Oxfmt。
根目录配置同时覆盖 `src/`、`packages/` 和 `scripts/`，按规则分工，而不是把 Vue 文件全部排除在 Oxlint 之外。

```bash
pnpm lint          # Oxlint 检查全部脚本，ESLint 检查 .vue 和 .html
pnpm lint:fix      # 应用两者支持的自动修复
pnpm lint:strict   # 任一检查的警告或错误都会导致失败
pnpm format        # 使用 Oxfmt 格式化项目文件
pnpm format:check  # 只检查格式，不修改文件
```

Oxlint 在 `.oxlintrc.json` 中启用 TypeScript、Vue、Unicorn 和 Oxc 插件，
使用 correctness 规则检查 JS、TS 和 Vue 的脚本部分，默认以警告报告。
ESLint 在 `eslint.config.js` 中使用 `eslint-plugin-vue` 的 Vue 3 recommended 配置，
对 `.vue` 文件检查模板及剩余 Vue 规则；Vue 模板由 Vue 解析器处理，文件内的 TypeScript 脚本使用 `@typescript-eslint/parser`。
独立 JS/TS 文件由 Oxlint 检查，ESLint 命令、全局忽略配置及编辑器验证范围均排除这些文件。
配置最后通过 `eslint-plugin-oxlint.buildFromConfigFile` 读取实际 Oxlint 配置，关闭重叠的 ESLint 规则。
新增 ESLint 规则或插件应放在这段去重配置之前。两套检查都必须运行。

独立 `.html` 使用 `@html-eslint/eslint-plugin` 的 recommended 规则，可单独执行 `pnpm lint:html`。
检查标签、重复属性/ID、图片 alt、文档标题等；格式规则关闭，空元素自闭合与 Oxfmt 保持一致。
Vue 规则与 HTML 规则分别限定文件范围，HTML 内嵌 `<script>` / `<style>` 内容不在本次新增 lint 范围内。

格式规则交给 Oxfmt；关闭 Vue 2 专用规则，允许路由组件命名为 `index.vue`。
原生事件同名提示设为 warning，保留既有组件事件 API。`vue-tsc -b` 继续负责类型检查。
Oxfmt 支持 Vue 的 template、script 和 style，统一使用两空格缩进、双引号和分号。
构建产物、临时文件和 `public/` 静态资源不参与检查或格式化，锁文件不参与格式化。
未批量格式化既有源码，因此 `format:check` 可能报告历史格式差异。

VS Code 安装工作区推荐的 **Oxc**（`oxc.oxc-vscode`）、**ESLint**（`dbaeumer.vscode-eslint`）
和 **Vue - Official**（`Vue.volar`）扩展。Oxc 使用原生 Oxlint，ESLint 对 Vue 和 HTML 文件提供规则诊断，
Vue - Official 提供类型和 Vue 语言服务。工作区已将 Oxfmt 设置为默认格式化器并启用保存格式化。
从旧适配器迁移后，请执行 **Developer: Reload Window**，让编辑器重新加载检查器。
直接打开本仓库根目录，以便扩展发现本地依赖和配置。

方案参考：[Oxlint](https://oxc.rs/docs/guide/usage/linter)、
[eslint-plugin-vue](https://eslint.vuejs.org/user-guide/)、
[eslint-plugin-oxlint](https://github.com/oxc-project/eslint-plugin-oxlint)。

## 本地 DEM 色阶瓦片

路由：`/examples/terrain/local-dem`

该示例支持选择或拖入本地 `.tif`、`.tiff`、`.asc` 文件，在浏览器内解析
DEM，并实现自定义 Cesium `ImageryProvider` 按视野生成 256 × 256
影像瓦片。页面提供色阶、显示范围、山体阴影和不透明度控制。

支持的坐标系与实现限制见
[`src/examples/terrain/local-dem/README.md`](src/examples/terrain/local-dem/README.md)。

```bash
pnpm build
pnpm preview
```
