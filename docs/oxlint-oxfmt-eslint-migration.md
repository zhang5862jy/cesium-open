# Vue 3 + TypeScript 项目：Oxlint、Oxfmt、ESLint 接入与内网迁移指南

记录日期：2026-10-24。本文的 Vue/TS 迁移示例保留原始范围；独立 HTML 接入增补见下方说明，当前完整配置以仓库文件为准。

> HTML 接入增补：当前已增加固定版本的 `@html-eslint/eslint-plugin`，ESLint CLI glob 改为 `**/*.{vue,html}`，编辑器 `eslint.validate` 改为 `["vue", "html"]`。`eslint.config.js` 将所有 Vue 预设项限定到 `**/*.vue`，另为 `**/*.html` 设置 `language: "html/html"` 和 recommended 规则，关闭格式规则并设置空元素自闭合。`pnpm lint:html` 可单独检查 HTML；独立 JS/TS 仍被 ESLint 全局忽略。迁移下文配置时需合并此增补，离线缓存准备需包含新增依赖。HTML 内嵌脚本/CSS 不在新增检查范围内。

适用范围：Vue 3 + TypeScript + pnpm 项目。示例命令默认在项目根目录执行，内网示例使用 Windows PowerShell。其他项目应合并配置，不要整体覆盖业务依赖、构建命令、工作区设置或原有团队规则。

## 1. 最终方案是什么

**Oxlint 检查全部受支持的脚本；ESLint 只检查 `.vue` 的补充规则；Oxfmt 负责格式；TypeScript 保留类型检查。**

这里的“全部”不包括配置排除的产物、临时文件、静态资源等。

| 文件或内容                                 | Oxlint                      | ESLint                      | TypeScript / Vue 语言服务                          | Oxfmt        |
| ------------------------------------------ | --------------------------- | --------------------------- | -------------------------------------------------- | ------------ |
| 独立 `.js`、`.ts` 及对应模块、JSX/TSX 文件 | 执行脚本 lint               | 不参与                      | 按项目配置检查；JS 是否查类型取决于 checkJs 等设置 | 格式化       |
| `.vue` 的 `<script>` / `<script setup>`    | 执行支持的脚本规则          | 解析脚本，执行剩余 Vue 规则 | 类型检查                                           | 格式化       |
| `.vue` 的 `<template>`                     | 当前方案不交给它做模板 lint | Vue 模板语法及规则检查      | 模板类型检查                                       | 格式化       |
| `.vue` 的 `<style>`                        | 不负责                      | 不负责通用 CSS lint         | 不负责通用 CSS lint                                | 格式化       |
| JSON、CSS、Markdown 等受支持的文本         | 当前方案不做对应专用 lint   | 不参与                      | 不参与                                             | 按配置格式化 |

ESLint 只接收 Vue 文件，不等于只读取模板文本。它需要解析完整 SFC，才能处理组件定义与模板的关联。`@typescript-eslint/parser` 用于解析 Vue 文件内部的 TypeScript，不会因此让独立 `.ts` 文件重新进入 ESLint。

### 1.1 各个包的职责

- `oxlint`：实际运行的快速 linter，包含原生实现的多种规则。
- `oxfmt`：实际运行的格式化器，不替代 lint，也不提供类型检查。
- `eslint`：运行 Vue 补充规则的检查引擎。
- `eslint-plugin-vue`：提供 Vue 规则和 Vue flat config，配置使用 Vue 专用解析器处理 SFC。
- `eslint-plugin-oxlint`：根据已启用的 Oxlint 规则，在 ESLint 中关闭重复项；它不执行 Oxlint，也不提供 Vue 模板检查。
- `@typescript-eslint/parser`：让 ESLint 在 Vue 文件内理解 TypeScript 语法。本方案未开启它的基于类型信息的检查，也未配置 `project` 或 `projectService`。
- `typescript`、`vue-tsc`、编辑器语言服务：继续负责类型、名称解析和类型相关错误。

### 1.2 速度应该怎样理解

独立 TS 文件的编辑器检查是 **Oxlint + TypeScript 服务**，不是 Oxlint + ESLint + TypeScript 三者同时 lint。

Vue 文件会涉及三个工具，但职责不同。去重的是 Oxlint 与 ESLint 的对应规则，不是关闭 TypeScript 的重叠诊断，也不是让两个解析器共用一次解析结果。

当前 `pnpm lint` 顺序执行：

```text
Oxlint 检查耗时 + ESLint 检查 Vue 文件耗时 + 启动开销
```

不能把总耗时称为“纯 Oxlint 的速度”。此方案减少 ESLint 的文件范围和规则执行量；实际收益应在目标项目、目标机器上测量。对比时保持 Node/pnpm 版本、规则覆盖、文件集和缓存条件一致，不要拿关闭大量规则后的耗时当作等价提速。

`&&` 表示前一项成功后才运行后一项。严格模式若 Oxlint 因警告失败，ESLint 会被跳过；需要查看全部问题时可以分别运行两个工具。

## 2. 本次修改清单

| 文件或项目                | 最终变化                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `package.json`            | 添加并固定 lint/format 依赖；增加普通检查、自动修复、严格检查、格式化命令                  |
| `pnpm-lock.yaml`          | 记录工具及所有传递依赖，安装时复用锁定版本                                                 |
| `.oxlintrc.json`          | 启用 TypeScript、Unicorn、Oxc、Vue 插件；correctness 默认 warning；配置忽略路径            |
| `eslint.config.js`        | Vue 3 recommended 配置；独立 JS/TS 全局忽略；Vue 内的 TS 解析；去除重复规则                |
| `.oxfmtrc.json`           | 两空格、双引号、分号、80 列、LF；覆盖 Vue 的模板、脚本和样式                               |
| `.vscode/settings.json`   | Oxfmt 默认格式化器、保存格式化；启用原生 Oxlint；ESLint 仅验证 Vue                         |
| `.vscode/extensions.json` | 推荐 Oxc、ESLint、Vue - Official                                                           |
| `.gitignore`              | 允许提交上述两个工作区配置文件                                                             |
| `README.md`、`AGENTS.md`  | 记录命令、规则分工和维护要求                                                               |
| 旧适配器                  | 移除 `oxlint-vue` 依赖、适配器专用 `settings.vue.rules` 与编辑器路径覆盖                   |
| 旧补丁                    | 移除 `patches/oxlint-vue@0.3.2.patch` 及对应 `patchedDependencies`；清理本次适配器临时产物 |

迁移未批量改写业务源码，也未把历史格式全部统一。构建脚本仍保留类型检查。`pnpm-workspace.yaml` 不再含该适配器补丁；其他工作区或安装脚本设置不属于 lint 方案，不需要照搬。

之前适配器把模板表达式转换成临时脚本，曾造成 `no-unused-expressions` 误报和 `incomplete-template` 警告。最终方案直接用 ESLint 的 Vue 解析支持，不再依赖那条转换链路，也不需要其补丁。

## 3. 已验证版本与准备条件

以下是本仓库快照，不表示永远应安装最新版。

| npm 包                    | 本仓库固定版本 |
| ------------------------- | -------------- |
| oxlint                    | 1.89.0         |
| oxfmt                     | 0.74.0         |
| eslint                    | 10.13.0        |
| eslint-plugin-vue         | 10.11.1        |
| eslint-plugin-oxlint      | 1.89.0         |
| @typescript-eslint/parser | 8.72.0         |

本机运行环境：Node `24.22.0`、pnpm `12.14.0`、Windows。本机扩展：Oxc `1.64.1`、ESLint `3.0.34`、Vue - Official `3.3.13`。

以安装包实际的 `engines` 为准：这组 ESLint 要求 `^20.19.0 || ^22.13.0 || >=24`；Oxlint/Oxfmt 要求 `^20.19.0 || >=22.12.0`。其他项目的构建工具可能有额外要求。离线复现优先使用验证过的同一 Node、pnpm 和操作系统架构组合，不要用忽略 engines 的方式强行安装。

其他项目已有的 `typescript`、`vue-tsc`、Vue、Vite 版本要按其兼容关系保留或单独升级，不要为复制 lint 配置而整体替换。

## 4. 迁移其他项目的步骤

### 4.1 先检查已有规则

1. 保存当前可恢复状态，记录现有 lint、build 结果。
2. 检查 `.eslintrc.*`、`eslint.config.*`、Prettier、格式化扩展、CI 与 Git hooks。
3. 对团队自定义规则逐条判断：Oxlint 是否支持、是否实际启用、是否仍需要 ESLint。
4. 若项目依赖 Oxlint 未覆盖的独立 TS/JS ESLint 规则，当前“ESLint 只检查 Vue”的范围不能保留这些检查。先选择替代规则或明确接受差异；不要直接删除旧配置后声称检查覆盖完全等价。
5. 本方案针对 Vue 3。Vue 2、React、Nuxt、特殊语言插件项目应调整对应预设与文件范围。

### 4.2 安装固定版本依赖

在有网络或可访问内网 npm 仓库的准备环境执行：

```powershell
pnpm add -D -E oxlint@1.89.0 oxfmt@0.74.0 eslint@10.13.0 eslint-plugin-vue@10.11.1 eslint-plugin-oxlint@1.89.0 @typescript-eslint/parser@8.72.0
```

如果目标是 pnpm workspace 根目录，且 pnpm 要求显式允许根依赖，改用 `pnpm add -Dw -E ...`。不需要额外安装 `@typescript-eslint/eslint-plugin` 来完成本文的 Vue 内 TS 解析。

若原项目安装了旧适配器，先移除它对应的补丁配置，再执行 `pnpm remove -D oxlint-vue`（workspace 根目录按需加 `-w`）。只删除该包的补丁项，保留其他包的补丁。随后按实际情况删除其补丁文件。

删除旧的 `oxc.path.oxlint` 适配器路径；删除旧适配器的 `settings.vue.rules`，将需要保留的 Vue 规则放入下面的 ESLint 配置。关闭旧适配器进程后，仅清理确认由它生成的 `.vue.ts` 文件，不能通配删除项目真实源码。

### 4.3 合并 package.json 命令

保留原有开发、构建和测试命令，只合并以下字段：

```json
{
  "scripts": {
    "lint": "oxlint . && eslint \"**/*.vue\"",
    "lint:fix": "oxlint --fix . && eslint --fix \"**/*.vue\"",
    "lint:strict": "oxlint . --max-warnings=0 && eslint \"**/*.vue\" --max-warnings=0",
    "format": "oxfmt --write .",
    "format:check": "oxfmt --check ."
  }
}
```

引号里的 `**/*.vue` 交给 ESLint 展开，避免 shell 提前展开，覆盖根目录及工作区中的 Vue 文件。没有 Vue 文件的项目应去掉 ESLint Vue 命令，而不是强行保留会找不到匹配文件的 glob。

### 4.4 添加 .oxlintrc.json

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn", "oxc", "vue"],
  "categories": {
    "correctness": "warn"
  },
  "ignorePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/dist-ssr/**",
    ".tmp/**",
    "public/**"
  ]
}
```

`correctness: warn` 表示启用此分类的规则并默认按警告报告。普通 `pnpm lint` 允许警告；严格模式用 `--max-warnings=0` 拒绝警告。语法错误等仍可能导致检查失败。

`plugins` 里的 `vue` 是 Oxlint 内置的 Vue 相关脚本规则，不是让 Oxlint 接管整个 Vue 模板。

### 4.5 添加 eslint.config.js

下面是本项目完整最终配置：

```js
import { fileURLToPath } from "node:url";
import tsParser from "@typescript-eslint/parser";
import vue from "eslint-plugin-vue";
import oxlint from "eslint-plugin-oxlint";

export default [
  {
    // Standalone scripts are checked by Oxlint, including direct ESLint invocations.
    ignores: [
      "**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-ssr/**",
      ".tmp/**",
      "public/**",
    ],
  },
  ...vue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tsParser, extraFileExtensions: [".vue"] },
    },
    // Formatting belongs to Oxfmt; this repository uses Vue 3.
    rules: {
      "vue/html-self-closing": "off",
      "vue/no-multi-spaces": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/multiline-html-element-content-newline": "off",
      "vue/html-indent": "off",
      "vue/attributes-order": "off",
      "vue/order-in-components": "off",
      "vue/html-comment-content-spacing": "off",
      "vue/html-comment-content-newline": "off",
      "vue/no-spaces-around-equal-signs-in-attribute": "off",
      "vue/mustache-interpolation-spacing": "off",
      "vue/max-attributes-per-line": "off",
      "vue/first-attribute-linebreak": "off",
      "vue/html-quotes": "off",
      "vue/static-class-names-order": "off",
      "vue/html-closing-bracket-spacing": "off",
      "vue/html-closing-bracket-newline": "off",
      "vue/padding-line-between-blocks": "off",
      "vue/block-order": "off",
      "vue/block-tag-newline": "off",
      "vue/v-slot-style": "off",
      "vue/v-on-style": "off",
      "vue/v-bind-style": "off",
      "vue/v-for-delimiter-style": "off",
      "vue/prefer-true-attribute-shorthand": "off",
      "vue/prefer-separate-static-class": "off",
      "vue/no-static-inline-styles": "off",
      "vue/no-v-for-template-key": "off",
      "vue/no-v-model-argument": "off",
      "vue/no-custom-modifiers-on-v-model": "off",
      "vue/no-multiple-template-root": "off",
      "vue/no-root-v-if": "off",
      "vue/multi-word-component-names": "off",
      "vue/no-shadow-native-events": "warn",
    },
  },
  // Disable only rules enabled by our Oxlint config. Keep this last.
  ...(await oxlint.buildFromConfigFile(
    fileURLToPath(new URL("./.oxlintrc.json", import.meta.url)),
  )),
];
```

关键点：

- 第一个只含 `ignores` 的配置对象是全局忽略，确保即使执行 `eslint .` 也跳过独立 JS/TS 文件。
- 不能保留原先面向独立 `**/*.ts` 的 ESLint parser 或规则配置，再以为只有命令改了就不会检查 TS。
- Vue 外层解析器来自 Vue 预设；`parserOptions.parser` 只负责 Vue 内部的 TS。不要把 Vue 文件外层解析器替换成 TS parser，否则模板会解析失败。
- 最后的 `buildFromConfigFile` 根据实际 Oxlint 配置关闭对应 ESLint 规则；不要换成无差别关闭所有支持规则的配置。否则 Oxlint 未启用的规则也可能被关闭。
- 新增 Vue 规则应放在去重配置前。某条规则若必须由 ESLint 执行，应同时明确处理 Oxlint 侧的对应配置，避免重复或漏检。
- 关闭项包含格式、代码呈现偏好、Vue 2 专用规则和本仓库的命名策略，并非每一项都能由 Oxfmt 等价替代。其他团队可按需要保留部分约束。
- `multi-word-component-names: off` 是允许 `index.vue` 等命名的项目选择；`no-shadow-native-events: warn` 是兼容现有事件 API 的选择。

本仓库 `package.json` 有 `"type": "module"`，因此使用 `eslint.config.js` 中的 ESM import 和顶层 await。其他项目如果是 CommonJS，优先把此文件命名为 `eslint.config.mjs`，不要仅为 ESLint 修改整个项目的模块类型。

独立 JS/TS 不经过 ESLint 的三层保证是：**CLI 的 Vue glob、配置的全局忽略、编辑器的 Vue 验证范围**。不能只改其中一层。

### 4.6 添加 .oxfmtrc.json

```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": false,
  "printWidth": 80,
  "trailingComma": "all",
  "endOfLine": "lf",
  "vueIndentScriptAndStyle": false,
  "embeddedLanguageFormatting": "auto",
  "sortImports": false,
  "sortPackageJson": false,
  "ignorePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/dist-ssr/**",
    ".tmp/**",
    "public/**",
    "pnpm-lock.yaml"
  ]
}
```

含义：两空格缩进、双引号、分号、目标行宽 80、LF 换行；不自动排序 import 或 package.json 字段；Vue 的 script/style 不整体额外缩进。`80` 是格式化目标宽度，不代表所有不可拆分字符串都会强制压缩到 80 字符以内。

Oxfmt 负责格式，ESLint 的冲突格式规则应关闭。当前方案不需要 `eslint-plugin-prettier` 来运行格式化，也不需要把 Prettier 设为默认格式化器。若原项目还有其他用途的 Prettier 集成，先确认用途再移除。

忽略 `public/` 是本项目的选择；如果其他项目在该目录维护手写代码或文档，应调整范围。`format:check` 可能报告历史格式差异；首次全量格式化会产生较大 diff，建议独立提交，避免与业务修改混合。

### 4.7 编辑器配置

`.vscode/settings.json`：

```json
{
  "editor.defaultFormatter": "oxc.oxc-vscode",
  "editor.formatOnSave": true,
  "editor.formatOnSaveMode": "file",
  "[javascript]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[typescript]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[vue]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[jsonc]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[css]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[scss]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[html]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[markdown]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "[yaml]": {
    "editor.defaultFormatter": "oxc.oxc-vscode"
  },
  "oxc.enable.oxlint": true,
  "oxc.enable.oxfmt": true,
  "eslint.validate": ["vue"]
}
```

`.vscode/extensions.json`：

```json
{
  "recommendations": ["oxc.oxc-vscode", "Vue.volar", "dbaeumer.vscode-eslint"]
}
```

如果 `.gitignore` 忽略了 `.vscode` 内容，保留：

```gitignore
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
```

合并配置时保留原项目的调试、路径和其他编辑器设置。扩展推荐列表不会自动安装扩展，所有机器都需要安装对应扩展。

保存文件时当前配置只明确开启 Oxfmt 格式化；没有额外设置保存时 `source.fixAll.eslint`。`pnpm lint:fix` 才是明确运行自动修复的命令。若用户或工作区另有保存修复设置，也要核对是否符合团队预期。

直接打开项目根目录，执行 `Developer: Reload Window` 让旧服务退出并加载新配置。普通 TS 的 TypeScript 诊断应继续保留，不要通过关闭 `typescript.validate.enable` 来隐藏真实类型错误。

## 5. 内网机器如何准备与安装

### 5.1 有内部 npm 仓库

优先通过团队的 Nexus、Artifactory、Verdaccio 或其他 npm 代理提供包。

1. 确保内部仓库包含上面的固定版本、传递依赖以及目标平台的原生包。
2. 在目标项目 `.npmrc` 中按团队要求设置 registry，例如以下占位地址必须替换：

```ini
registry=https://npm.example.internal/
```

3. 合并目标项目自己的 `package.json`，通过内部仓库生成它自己的锁文件。
4. 将配置、依赖清单和更新后的 `pnpm-lock.yaml` 一起提交，其他机器执行：

```powershell
pnpm install --frozen-lockfile
```

不要把本 Cesium 仓库的整个 lockfile 套到依赖不同的项目；每个项目都应生成自己的锁文件。认证信息按团队方式提供，不要在学习文档或提交的配置中写入真实 token。

### 5.2 完全离线：在联网准备机制作依赖包

**离线迁移的单位应是“目标项目 + 已生成的目标锁文件 + 完整缓存 + 对应平台工具”，不是几个 npm 包的压缩文件。**

准备机尽量与内网机保持相同 OS、CPU 架构、Node/pnpm 版本。Oxlint、Oxfmt 以及项目构建工具可能通过 optional dependencies 分发原生平台包。Windows x64 的缓存不保证能用于 Linux 或 ARM64；需要为每种目标平台单独准备并验证。

先在目标项目的准备副本中合并本文配置、安装依赖并生成锁文件。然后用一个独立缓存目录准备传输，例如：

```powershell
# 联网准备机，路径是示例，可自行调整
pnpm fetch --store-dir D:/offline-kit/pnpm-store
```

这里不使用 `--prod`，因为 lint/format 属于 devDependencies；也不要使用 `--no-optional` 排除原生包。`pnpm fetch` 根据锁文件准备依赖，`file:` 本地目录依赖与 workspace 源码仍需随项目完整提供。[pnpm fetch 官方说明](https://pnpm.io/cli/fetch)

再在另一个没有 `node_modules` 的目标项目副本中做离线演练，确保真正用到准备好的缓存：

```powershell
pnpm install --offline --frozen-lockfile --store-dir D:/offline-kit/pnpm-store
pnpm exec oxlint --version
pnpm exec oxfmt --version
pnpm exec eslint --version
pnpm lint
pnpm build
```

在干净副本演练，避免已有 `node_modules` 掩盖缓存缺失。还需按项目实际构建过程准备非 npm 下载资源；例如有些依赖的安装脚本会访问外部服务器，npm 包缓存本身不保证这些资源齐全。

将以下内容传入内网：

- 目标项目源码、全部 workspace 包和本地依赖。
- 目标项目的 `package.json`、`pnpm-lock.yaml`、必要的 `pnpm-workspace.yaml` 与本文配置文件。
- 完整 `D:/offline-kit/pnpm-store` 目录，保留目录结构。
- 可离线安装的 Node、同版本 pnpm，以及匹配内网编辑器平台的 VSIX 文件。
- 依赖安装脚本、构建过程另需的本地资源与团队安装说明。

在内网机已安装 Node/pnpm 后，假设缓存放到 `E:/offline-kit/pnpm-store`：

```powershell
node --version
pnpm --version
pnpm install --offline --frozen-lockfile --store-dir E:/offline-kit/pnpm-store
```

`--offline` 只使用缓存，缺包直接失败；`--prefer-offline` 仍会尝试下载缺失包，不能代替离线验证。冻结锁文件能防止离线机重新解析或改写依赖。[pnpm install 官方说明](https://pnpm.io/cli/install)

不要依赖进入内网后才首次执行会联网下载 pnpm 的引导命令；Node 和包管理器本身必须提前准备并离线验证。本文没有生成离线安装包，实际缓存和 VSIX 需按目标机器制作。

### 5.3 VS Code 扩展的离线安装

在联网环境从官方扩展 Marketplace 的对应扩展页面或支持下载 VSIX 的官方界面取得：

| 扩展           | ID                     | 本机已验证版本 |
| -------------- | ---------------------- | -------------- |
| Oxc            | oxc.oxc-vscode         | 1.64.1         |
| ESLint         | dbaeumer.vscode-eslint | 3.0.34         |
| Vue - Official | Vue.volar              | 3.3.13         |

选择适合目标 OS/架构及 VS Code 版本的 VSIX；若扩展声明其他扩展依赖，也需要提前准备。npm 依赖缓存与编辑器 VSIX 是两件不同的事，缺任何一项都会影响体验。

内网可通过扩展视图的 **Install from VSIX...** 安装，或执行以下示例命令，文件名以实际下载内容为准：

```powershell
code --install-extension E:/offline-kit/vsix/oxc.vsix
code --install-extension E:/offline-kit/vsix/eslint.vsix
code --install-extension E:/offline-kit/vsix/vue-official.vsix
code --list-extensions --show-versions
```

安装后重载窗口，查看 Output 中各扩展的日志确认服务已启动。本项目配置使用本地 npm 工具；不要只安装 VSIX 而不安装项目依赖。[VS Code 扩展安装说明](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)

WSL、SSH 或容器开发时，注意扩展和依赖应安装在实际运行语言服务的远端环境，并准备该环境的平台包。

## 6. 如何验证迁移确实生效

### 6.1 基础命令

```powershell
pnpm exec oxlint --version
pnpm exec oxfmt --version
pnpm exec eslint --version
pnpm lint
pnpm lint:strict
pnpm format:check
pnpm build
```

`lint:strict` 和 `format:check` 可能因历史问题失败。应记录并处理具体问题，而不是为让命令变绿就关闭规则。其他项目的 `build` 未必包含类型检查；Vue 项目需额外确保运行适配自身 tsconfig 的 `vue-tsc`，普通 TS 项目运行适配自身的 `tsc`。

本仓库构建先构建 workspace 包，再执行 `vue-tsc -b` 和 Vite。不要把其中的 Cesium 包名或测试脚本复制到其他项目。

### 6.2 验证普通 TS 不经过 ESLint

在项目根目录执行，路径替换为目标项目的真实 TS 文件：

```powershell
node --input-type=module -e 'import { ESLint } from "eslint"; const e = new ESLint(); console.log(await e.isPathIgnored("src/main.ts")); console.log(await e.calculateConfigForFile("src/main.ts"));'
```

预期分别输出 `true` 和 `undefined`。这说明 ESLint 配置层已忽略该文件，而不只是 package.json 的命令暂时没有传入它。

还可以检查整个项目的实际 ESLint 文件集：

```powershell
node --input-type=module -e 'import { ESLint } from "eslint"; const results = await new ESLint().lintFiles(["."]); console.log(results.length); console.log(results.every(r => r.filePath.endsWith(".vue")));'
```

预期只返回 Vue 文件，第二个输出为 `true`。当前仓库验证时匹配 39 个 Vue 文件；其他项目数量不同是正常的。

### 6.3 验证两套检查没有被一并关闭

在确认不存在同名文件后临时创建 `src/LintProbe.vue`：

```vue
<script setup lang="ts">
const items: number[] = [1, 2];
debugger;
</script>

<template>
  <div v-for="item in items">{{ item }}</div>
</template>
```

分别运行：

```powershell
pnpm exec oxlint src/LintProbe.vue
pnpm exec eslint src/LintProbe.vue
```

预期：Oxlint 报告 `no-debugger`；ESLint 报告 `vue/require-v-for-key`，而不是把模板当作独立 JS 表达式报未使用。其他规则可能也有提示。验证后删除自己创建的探针文件。

再创建一个独立 TS 探针，写入 `debugger;`，确认 Oxlint 报告，而 ESLint 将它忽略。不要依赖所有工具都必须报告同一个错误来证明功能正确。

### 6.4 验证格式化

对一个可恢复的文件使用 **Format Document**，或在临时文件中故意写乱缩进后保存，确认默认格式化器为 Oxc/Oxfmt。命令行也可以只检查一个文件：

```powershell
pnpm exec oxfmt --check src/App.vue
```

不要以 App.vue 当前是否已符合全部格式规则来判断工具是否安装成功；能产生清晰的格式检查结果即可，最终再按团队要求修复。

### 6.5 当前仓库验证记录

- `pnpm lint` 成功，0 error；共有 8 条现有源码 warning：Oxlint 6 条、ESLint 2 条。
- `pnpm lint:strict` 会因现有 warning 失败；其串行执行可能在 Oxlint 阶段终止。
- `pnpm build` 成功；存在 Vite 大 chunk 提示，与本方案无关。
- App.vue 的 Oxlint/ESLint 检查无警告，原有第 57、73 行适配器问题已消失。
- 验证了独立 JS/TS 被 ESLint 忽略、Vue 模板规则仍然生效、Oxlint 仍能检查 Vue 脚本。
- 未对全项目做格式清理，也未测量迁移前后等价规则集的速度倍数。

这些是迁移完成时的记录，后续业务代码变化会改变诊断数量，不应把“固定 8 条”当作目标。

## 7. 看懂编辑器诊断来源

| 提示                                 | 实际来源            | 含义                                                                |
| ------------------------------------ | ------------------- | ------------------------------------------------------------------- |
| `oxc[eslint(no-unused-expressions)]` | Oxlint              | 某表达式没有有效用途；`eslint(...)` 是规则分类，不表示启动了 ESLint |
| `eslint[vue/no-parsing-error]`       | ESLint + Vue 插件   | Vue 模板语法解析错误                                                |
| `ts(2304)`                           | TypeScript 语言服务 | 找不到名称，可能未声明、未导入或不在当前作用域                      |
| `ts(7008)`                           | TypeScript 语言服务 | 成员隐式具有 any 类型                                               |
| 格式差异、保存后缩进改变             | Oxfmt               | 格式化行为，不是类型检查                                            |

例如 `import { router } frdom './router'` 的 `frdom` 是语法错误。Oxlint 在解析阶段会报告，且可能无法继续运行该文件后续规则。TypeScript 语言服务有自己的错误恢复机制，因此仍可能报告后面的 `const` 重新赋值。

修正前面的语法后，Oxlint 与 TypeScript 可能同时报告常量重新赋值。这是两类检查之间的能力重叠，不是 ESLint 又检查了普通 TS。`eslint-plugin-oxlint` 不负责隐藏 TypeScript 诊断。

## 8. 常见问题与排查

### 普通 TS 仍出现 ESLint 来源的诊断

核对三个位置：package.json 使用 Vue glob；ESLint 全局忽略包含独立脚本扩展名；`.vscode/settings.json` 的 `eslint.validate` 只有 `vue`。然后运行 6.2 的验证命令。

若命令行正确而编辑器不正确，检查是否打开了另一个工作区、是否存在嵌套 ESLint 配置、扩展实际使用的工作目录以及是否还有旧进程。重载窗口后在 ESLint Output 日志中核对配置。不要把 `oxc[eslint(...)]` 误认成 ESLint。

### Vue 的 TypeScript 语法被报解析错误

确认 Vue 外层 parser 仍由 `eslint-plugin-vue` 提供，TS parser 在 `parserOptions.parser`。检查依赖安装成功且配置按 ESM 加载。不要用禁用 `vue/no-parsing-error` 来绕过解析问题。

### 显示 eslint.config.js 不支持 import 或顶层 await

检查 package.json 的模块类型。CommonJS 项目将配置文件改名为 `eslint.config.mjs`。不要因此把整项目改成 ESM。

### 离线安装报缺包、缺 native binding

检查目标 OS/架构、pnpm 版本、缓存目录是否完整，是否误用了 `--prod` 或 `--no-optional`。返回准备机为目标平台补齐缓存并在干净副本重做离线安装，不要通过关闭 lint 掩盖依赖缺失。

### lint 通过，但 build 报类型错误

这是正常的职责区别。lint 不等于类型检查。保留 TypeScript 服务和构建中的 `vue-tsc` / `tsc`，按类型错误修复源码。

### 格式化与 ESLint 来回改动

检查旧 Prettier、保存时修复动作、其他全局格式化器、Vue 格式规则是否仍启用。默认格式化器使用 Oxfmt；对新增 ESLint 规则确认是否涉及格式冲突。

## 9. 团队维护约定与迁移验收清单

- [ ] 依赖版本已确定，目标项目锁文件已更新；Node/pnpm 平台组合已验证。
- [ ] Oxlint 检查全部目标脚本，不把 `.vue` 整体排除在外。
- [ ] ESLint CLI、配置、编辑器三个层面都只处理 `.vue`。
- [ ] `eslint-plugin-oxlint` 从实际 Oxlint 配置生成去重项，并放在 ESLint 配置最后。
- [ ] 不再引用旧 `oxlint-vue`，其补丁和路径覆盖已移除。
- [ ] Oxfmt 负责格式化；没有冲突的旧格式化配置。
- [ ] TypeScript / Vue 类型检查仍保留。
- [ ] 原有自定义规则的保留或放弃经过确认，没有把 lint 成功误当成检查覆盖不变。
- [ ] CLI 检查、Vue 探针、TS 忽略验证与项目构建均已执行，历史问题有记录。
- [ ] 内网机已准备完整依赖缓存或内网 registry，以及平台匹配的 VSIX；离线安装已在干净副本演练。
- [ ] 配置、锁文件、编辑器推荐和团队说明一起提交；业务改动与大规模格式化尽量分开。

修改规则时先确定责任工具：脚本规则写入 `.oxlintrc.json`，Vue 补充规则写入 ESLint，格式写入 `.oxfmtrc.json`，类型约束写入项目 tsconfig。升级后重新验证实际诊断和去重效果，不要只验证安装成功。

## 10. 官方资料

以下链接用于后续联网查证；上面的配置已完整嵌入本文，内网学习不依赖点击链接。

- [Oxlint 使用说明](https://oxc.rs/docs/guide/usage/linter)
- [Oxlint 内置插件](https://oxc.rs/docs/guide/usage/linter/plugins)
- [Oxfmt 使用说明](https://oxc.rs/docs/guide/usage/formatter)
- [eslint-plugin-vue 配置指南](https://eslint.vuejs.org/user-guide/)
- [eslint-plugin-oxlint 与实际配置去重](https://github.com/oxc-project/eslint-plugin-oxlint)
- [pnpm fetch](https://pnpm.io/cli/fetch)
- [pnpm install 离线与冻结锁文件](https://pnpm.io/cli/install)
- [VS Code 扩展与 VSIX 安装](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)

