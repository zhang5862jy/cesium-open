import {
  defineComponent,
  h,
  inject,
  ref,
  version as hostVueVersion,
  type Component,
  type VNodeChild,
} from "vue";

const DEFAULT_MAX_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TEMPLATE_NODES = 64;
const MAX_TEMPLATE_DEPTH = 6;
const MAX_TEXT_LENGTH = 500;

const safeTags = [
  "remote-card",
  "remote-badge",
  "remote-text",
  "remote-metric",
  "remote-actions",
  "remote-button",
] as const;

type SafeTag = (typeof safeTags)[number];

const safeTagSet = new Set<string>(safeTags);

const allowedAttributes: Record<SafeTag, ReadonlySet<string>> = {
  "remote-card": new Set(["eyebrow", "title", "description"]),
  "remote-badge": new Set(["tone"]),
  "remote-text": new Set(),
  "remote-metric": new Set(["label", "source"]),
  "remote-actions": new Set(),
  "remote-button": new Set(["action", "step", "variant"]),
};

const allowedChildren: Record<SafeTag, ReadonlySet<SafeTag>> = {
  "remote-card": new Set([
    "remote-badge",
    "remote-text",
    "remote-metric",
    "remote-actions",
  ]),
  "remote-badge": new Set(),
  "remote-text": new Set(),
  "remote-metric": new Set(),
  "remote-actions": new Set(["remote-button"]),
  "remote-button": new Set(),
};

const tagsAllowingText = new Set<SafeTag>([
  "remote-badge",
  "remote-text",
  "remote-button",
]);

const supportedCapabilities = [
  "counter:read",
  "counter:write",
  "preference:read",
] as const;

const supportedCapabilitySet = new Set<string>(supportedCapabilities);

export type RemoteCapability = (typeof supportedCapabilities)[number];

export interface RemoteBehaviorLimits {
  actionsPerMinute: number;
  domMutationsPerSecond: number;
}

export interface RemoteComponentContract {
  capabilities: readonly RemoteCapability[];
  dependencies: Readonly<{ vue: string }>;
  limits: RemoteBehaviorLimits;
  protocolVersion: string;
}

export interface RemoteRuntimeAction {
  action: "decrement" | "increment" | "reset";
  step: number;
}

export interface RemoteRuntimeBridge {
  authorizeAction(action: RemoteRuntimeAction): boolean;
  isSuspended(): boolean;
}

export const REMOTE_RUNTIME_KEY = Symbol("remote-vue-runtime");

export interface RemoteSecurityCheck {
  detail: string;
  id: string;
  label: string;
  status: "passed" | "warning";
}

export type RemoteVueErrorCode =
  | "ABORTED"
  | "BAD_CONTENT_TYPE"
  | "BAD_INTEGRITY"
  | "BAD_MANIFEST"
  | "BAD_STATUS"
  | "BAD_TEMPLATE"
  | "CAPABILITY_DENIED"
  | "DEPENDENCY_MISMATCH"
  | "FETCH_FAILED"
  | "INVALID_ENCODING"
  | "ORIGIN_NOT_ALLOWED"
  | "PAYLOAD_TOO_LARGE"
  | "PROTOCOL_MISMATCH"
  | "TIMEOUT"
  | "UNSAFE_PROTOCOL";

export class RemoteVueComponentError extends Error {
  readonly code: RemoteVueErrorCode;

  constructor(code: RemoteVueErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "RemoteVueComponentError";
    this.code = code;
  }
}

interface SafeTextNode {
  type: "text";
  value: string;
}

interface SafeElementNode {
  type: "element";
  tag: SafeTag;
  attributes: Readonly<Record<string, string>>;
  children: readonly SafeTemplateNode[];
}

type SafeTemplateNode = SafeTextNode | SafeElementNode;

interface RemoteManifest {
  contract: RemoteComponentContract;
  name: string;
  initialCount: number;
}

export interface RemoteVueLoadOptions {
  allowedOrigins?: readonly string[];
  expectedSha256?: string;
  grantedCapabilities?: readonly RemoteCapability[];
  maxBytes?: number;
  signal?: AbortSignal;
  supportedProtocolVersions?: readonly string[];
  timeoutMs?: number;
}

export interface RemoteVueLoadResult {
  component: Component;
  componentName: string;
  contentType: string;
  contract: RemoteComponentContract;
  finalUrl: string;
  hostVueVersion: string;
  securityChecks: readonly RemoteSecurityCheck[];
  sha256: string;
  source: string;
  sourceBytes: number;
  templateNodes: number;
}

interface ParsedRemoteVueFile {
  manifest: RemoteManifest;
  root: SafeElementNode;
  templateNodes: number;
}

interface ReadBodyResult {
  bytes: Uint8Array<ArrayBuffer>;
  source: string;
}

/**
 * Loads a deliberately restricted Vue-like SFC.
 *
 * It never compiles remote templates and never executes remote JavaScript.
 * The accepted custom elements are interpreted into host-owned Vue VNodes.
 */
export async function loadRemoteVueComponent(
  sourceUrl: string,
  options: RemoteVueLoadOptions = {},
): Promise<RemoteVueLoadResult> {
  const allowedOrigins = new Set(
    options.allowedOrigins ?? [window.location.origin],
  );
  const requestUrl = validateRemoteUrl(sourceUrl, allowedOrigins);
  const maxBytes = normalizePositiveInteger(
    options.maxBytes,
    DEFAULT_MAX_BYTES,
    "maxBytes",
  );
  const timeoutMs = normalizePositiveInteger(
    options.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    "timeoutMs",
  );

  const controller = new AbortController();
  let didTimeout = false;
  const handleExternalAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    handleExternalAbort();
  } else {
    options.signal?.addEventListener("abort", handleExternalAbort, {
      once: true,
    });
  }
  const timeoutId = window.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(requestUrl, {
      cache: "no-store",
      credentials:
        requestUrl.origin === window.location.origin ? "same-origin" : "omit",
      headers: {
        Accept: "text/x-vue, text/plain;q=0.9, application/octet-stream;q=0.8",
      },
      // Redirects are rejected so an allowed URL cannot bounce the browser to
      // an origin that was never granted component-loading capability.
      redirect: "error",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new RemoteVueComponentError(
        "BAD_STATUS",
        `远程组件请求失败：HTTP ${response.status}`,
      );
    }

    const finalUrl = validateRemoteUrl(response.url, allowedOrigins);
    const contentType = validateContentType(
      response.headers.get("content-type"),
      finalUrl,
    );
    validateContentLength(response.headers.get("content-length"), maxBytes);

    const body = await readBodyWithLimit(response, maxBytes);
    const sha256 = await createSha256(body.bytes);
    validateIntegrity(sha256, options.expectedSha256);

    const parsed = parseRemoteVueFile(body.source);
    validateRuntimeContract(parsed.manifest.contract, {
      grantedCapabilities: new Set(options.grantedCapabilities ?? []),
      supportedProtocolVersions: new Set(
        options.supportedProtocolVersions ?? ["1.0"],
      ),
    });
    const securityChecks = createSecurityChecks({
      contract: parsed.manifest.contract,
      expectedIntegrity: Boolean(options.expectedSha256),
      finalUrl,
      templateNodes: parsed.templateNodes,
    });
    return {
      component: createRemoteVueComponent(parsed),
      componentName: parsed.manifest.name,
      contentType,
      contract: parsed.manifest.contract,
      finalUrl: finalUrl.href,
      hostVueVersion,
      securityChecks,
      sha256,
      source: body.source,
      sourceBytes: body.bytes.byteLength,
      templateNodes: parsed.templateNodes,
    };
  } catch (error) {
    if (error instanceof RemoteVueComponentError) throw error;
    if (controller.signal.aborted) {
      throw new RemoteVueComponentError(
        didTimeout ? "TIMEOUT" : "ABORTED",
        didTimeout ? `请求超过 ${timeoutMs} ms，已取消。` : "远程组件请求已取消。",
        error,
      );
    }
    throw new RemoteVueComponentError(
      "FETCH_FAILED",
      error instanceof Error ? error.message : "无法获取远程组件。",
      error,
    );
  } finally {
    window.clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", handleExternalAbort);
  }
}

function validateRemoteUrl(
  value: string,
  allowedOrigins: ReadonlySet<string>,
): URL {
  let url: URL;
  try {
    url = new URL(value, window.location.href);
  } catch (error) {
    throw new RemoteVueComponentError(
      "UNSAFE_PROTOCOL",
      "远程组件地址不是有效 URL。",
      error,
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RemoteVueComponentError(
      "UNSAFE_PROTOCOL",
      `不允许使用 ${url.protocol} 协议加载组件。`,
    );
  }
  if (url.origin !== window.location.origin && url.protocol !== "https:") {
    throw new RemoteVueComponentError(
      "UNSAFE_PROTOCOL",
      "跨域远程组件必须通过 HTTPS 提供。",
    );
  }
  if (!allowedOrigins.has(url.origin)) {
    throw new RemoteVueComponentError(
      "ORIGIN_NOT_ALLOWED",
      `来源 ${url.origin} 不在允许列表中。`,
    );
  }
  return url;
}

function validateContentType(value: string | null, finalUrl: URL): string {
  const contentType = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  // Vite and some static object stores do not register a MIME type for .vue.
  // The extension exception remains narrow; the response is still size,
  // integrity, UTF-8, manifest and template-schema checked below.
  if (!contentType && finalUrl.pathname.toLowerCase().endsWith(".vue")) {
    return "未提供（.vue）";
  }
  const allowed = new Set([
    "application/octet-stream",
    "application/vue",
    "text/plain",
    "text/x-vue",
  ]);
  if (!allowed.has(contentType)) {
    throw new RemoteVueComponentError(
      "BAD_CONTENT_TYPE",
      `响应类型 ${contentType || "(缺失)"} 不允许作为远程组件。`,
    );
  }
  return contentType;
}

function validateContentLength(value: string | null, maxBytes: number) {
  if (!value) return;
  const contentLength = Number(value);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RemoteVueComponentError(
      "PAYLOAD_TOO_LARGE",
      `远程组件超过 ${maxBytes} 字节上限。`,
    );
  }
}

async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<ReadBodyResult> {
  if (!response.body) {
    throw new RemoteVueComponentError(
      "FETCH_FAILED",
      "远程组件响应中没有可读取的正文。",
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new RemoteVueComponentError(
        "PAYLOAD_TOO_LARGE",
        `远程组件超过 ${maxBytes} 字节上限。`,
      );
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      bytes,
      source: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch (error) {
    throw new RemoteVueComponentError(
      "INVALID_ENCODING",
      "远程组件必须使用有效的 UTF-8 编码。",
      error,
    );
  }
}

async function createSha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function validateIntegrity(actual: string, expected?: string) {
  if (!expected) return;
  const normalized = expected.toLowerCase().replace(/^sha256-/, "");
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new RemoteVueComponentError(
      "BAD_INTEGRITY",
      "expectedSha256 必须是 64 位十六进制 SHA-256。",
    );
  }
  if (actual !== normalized) {
    throw new RemoteVueComponentError(
      "BAD_INTEGRITY",
      "远程组件的 SHA-256 与可信版本不一致。",
    );
  }
}

function parseRemoteVueFile(source: string): ParsedRemoteVueFile {
  // XML mode is intentionally used instead of text/html: HTML parsing moves
  // top-level scripts into <head> and repairs malformed markup. Strict XML
  // parsing keeps the received structure intact and fails closed.
  const documentNode = new DOMParser().parseFromString(
    `<remote-sfc>${source}</remote-sfc>`,
    "application/xml",
  );
  if (documentNode.getElementsByTagName("parsererror").length > 0) {
    throw badTemplate("远程组件不是结构完整的 XML 风格 SFC。");
  }

  const container = documentNode.documentElement;
  if (container.localName !== "remote-sfc") {
    throw badTemplate("远程组件无法进入安全解析容器。");
  }

  const topLevelElements = Array.from(container.children);
  const templateElements = topLevelElements.filter(
    (element) => element.localName === "template",
  );
  const scriptElements = topLevelElements.filter(
    (element) => element.localName === "script",
  );

  if (
    topLevelElements.length !== 2 ||
    templateElements.length !== 1 ||
    scriptElements.length !== 1
  ) {
    throw badTemplate(
      "远程文件只能包含一个 <template> 和一个 application/json <script>。",
    );
  }

  const templateElement = templateElements[0];
  const scriptElement = scriptElements[0];
  if (!templateElement || !scriptElement) {
    throw badTemplate("无法读取远程组件模板。");
  }
  if (scriptElement.getAttribute("type") !== "application/json") {
    throw badTemplate("远程 <script> 只能承载 application/json，不能包含代码。");
  }
  if (scriptElement.attributes.length !== 1) {
    throw badTemplate("远程 manifest 的 <script> 不允许附加其他属性。");
  }
  if (templateElement.attributes.length !== 0) {
    throw badTemplate("远程 <template> 不允许附加属性或 Vue 指令。");
  }

  const manifest = parseManifest(scriptElement.textContent ?? "");
  const meaningfulRoots = Array.from(templateElement.childNodes).filter(
    isMeaningfulNode,
  );
  if (meaningfulRoots.length !== 1) {
    throw badTemplate("远程 <template> 必须且只能有一个根节点。");
  }

  const counter = { value: 0 };
  const root = parseTemplateNode(meaningfulRoots[0]!, null, 0, counter);
  if (!root || root.type !== "element" || root.tag !== "remote-card") {
    throw badTemplate("远程模板根节点必须是 <remote-card>。");
  }

  return {
    manifest,
    root,
    templateNodes: counter.value,
  };
}

function parseManifest(source: string): RemoteManifest {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new RemoteVueComponentError(
      "BAD_MANIFEST",
      "远程组件 manifest 不是有效 JSON。",
      error,
    );
  }
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ["name", "initialState", "contract"])
  ) {
    throw badManifest("manifest 只允许 name、initialState 和 contract 字段。");
  }
  if (
    typeof value.name !== "string" ||
    !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value.name)
  ) {
    throw badManifest("manifest.name 格式不合法。");
  }
  if (
    !isPlainRecord(value.initialState) ||
    !hasOnlyKeys(value.initialState, ["count"]) ||
    !Number.isSafeInteger(value.initialState.count) ||
    Number(value.initialState.count) < -999 ||
    Number(value.initialState.count) > 999
  ) {
    throw badManifest("initialState.count 必须是 -999 到 999 之间的整数。");
  }
  const contract = parseContract(value.contract);
  return {
    contract,
    name: value.name,
    initialCount: Number(value.initialState.count),
  };
}

function parseContract(value: unknown): RemoteComponentContract {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, [
      "protocolVersion",
      "dependencies",
      "capabilities",
      "limits",
    ])
  ) {
    throw badManifest(
      "contract 必须完整声明 protocolVersion、dependencies、capabilities 和 limits。",
    );
  }
  if (
    typeof value.protocolVersion !== "string" ||
    !/^\d+\.\d+$/.test(value.protocolVersion)
  ) {
    throw badManifest("contract.protocolVersion 必须使用 major.minor 格式。");
  }
  if (
    !isPlainRecord(value.dependencies) ||
    !hasOnlyKeys(value.dependencies, ["vue"]) ||
    typeof value.dependencies.vue !== "string" ||
    !/^>=\d+\.\d+\.\d+ <\d+\.\d+\.\d+$/.test(value.dependencies.vue)
  ) {
    throw badManifest(
      "contract.dependencies.vue 必须是形如 >=3.5.0 <4.0.0 的闭开版本范围。",
    );
  }
  if (
    !Array.isArray(value.capabilities) ||
    value.capabilities.length > supportedCapabilities.length ||
    value.capabilities.some(
      (capability) =>
        typeof capability !== "string" ||
        !supportedCapabilitySet.has(capability),
    ) ||
    new Set(value.capabilities).size !== value.capabilities.length
  ) {
    throw badManifest("contract.capabilities 包含未知或重复的能力。");
  }
  if (
    !isPlainRecord(value.limits) ||
    !hasOnlyKeys(value.limits, [
      "domMutationsPerSecond",
      "actionsPerMinute",
    ]) ||
    !isIntegerInRange(value.limits.domMutationsPerSecond, 5, 500) ||
    !isIntegerInRange(value.limits.actionsPerMinute, 1, 600)
  ) {
    throw badManifest(
      "contract.limits 必须声明有效的 DOM 变更速率和每分钟动作上限。",
    );
  }

  return {
    protocolVersion: value.protocolVersion,
    dependencies: { vue: value.dependencies.vue },
    capabilities: value.capabilities as RemoteCapability[],
    limits: {
      domMutationsPerSecond: Number(value.limits.domMutationsPerSecond),
      actionsPerMinute: Number(value.limits.actionsPerMinute),
    },
  };
}

function validateRuntimeContract(
  contract: RemoteComponentContract,
  host: {
    grantedCapabilities: ReadonlySet<RemoteCapability>;
    supportedProtocolVersions: ReadonlySet<string>;
  },
) {
  if (!host.supportedProtocolVersions.has(contract.protocolVersion)) {
    throw new RemoteVueComponentError(
      "PROTOCOL_MISMATCH",
      `远程协议 ${contract.protocolVersion} 与宿主不兼容。`,
    );
  }
  if (!satisfiesClosedOpenRange(hostVueVersion, contract.dependencies.vue)) {
    throw new RemoteVueComponentError(
      "DEPENDENCY_MISMATCH",
      `宿主 Vue ${hostVueVersion} 不满足远程组件要求 ${contract.dependencies.vue}。`,
    );
  }

  const denied = contract.capabilities.filter(
    (capability) => !host.grantedCapabilities.has(capability),
  );
  if (denied.length > 0) {
    throw new RemoteVueComponentError(
      "CAPABILITY_DENIED",
      `宿主未授权远程组件能力：${denied.join("、")}。`,
    );
  }
}

function createSecurityChecks(input: {
  contract: RemoteComponentContract;
  expectedIntegrity: boolean;
  finalUrl: URL;
  templateNodes: number;
}): RemoteSecurityCheck[] {
  return [
    {
      id: "transport",
      label: "来源与传输",
      status: "passed",
      detail: `${input.finalUrl.origin} 已授权；跨域仅 HTTPS，禁止重定向。`,
    },
    {
      id: "integrity",
      label: "版本完整性",
      status: input.expectedIntegrity ? "passed" : "warning",
      detail: input.expectedIntegrity
        ? "SHA-256 与宿主固定的可信版本一致。"
        : "自定义地址未固定哈希，仍执行全部结构与权限校验。",
    },
    {
      id: "static-scan",
      label: "AST 级静态扫描",
      status: "passed",
      detail: `${input.templateNodes} 个节点通过严格 XML AST、标签、属性和父子结构白名单。`,
    },
    {
      id: "dependencies",
      label: "依赖契约",
      status: "passed",
      detail: `宿主 Vue ${hostVueVersion} 满足 ${input.contract.dependencies.vue}，远程文件不携带 Vue 副本。`,
    },
    {
      id: "capabilities",
      label: "最小能力授权",
      status: "passed",
      detail: input.contract.capabilities.length
        ? `仅授权 ${input.contract.capabilities.join("、")}。`
        : "组件未申请宿主能力。",
    },
    {
      id: "execution",
      label: "不可执行远程代码",
      status: "passed",
      detail: "script 只允许 application/json；禁用 eval、指令、事件属性与动态 import。",
    },
  ];
}

function satisfiesClosedOpenRange(version: string, range: string) {
  const matched = range.match(
    /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/,
  );
  if (!matched?.[1] || !matched[2]) return false;
  return (
    compareVersions(version, matched[1]) >= 0 &&
    compareVersions(version, matched[2]) < 0
  );
}

function compareVersions(first: string, second: string) {
  const firstParts = first.split(".").map(Number);
  const secondParts = second.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (firstParts[index] ?? 0) - (secondParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function parseTemplateNode(
  node: Node,
  parentTag: SafeTag | null,
  depth: number,
  counter: { value: number },
): SafeTemplateNode | null {
  if (depth > MAX_TEMPLATE_DEPTH) {
    throw badTemplate(`模板嵌套不能超过 ${MAX_TEMPLATE_DEPTH} 层。`);
  }
  if (node.nodeType === Node.COMMENT_NODE) return null;
  if (node.nodeType === Node.TEXT_NODE) {
    const value = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!value) return null;
    if (!parentTag || !tagsAllowingText.has(parentTag)) {
      throw badTemplate(`<${parentTag ?? "template"}> 中不允许直接放置文本。`);
    }
    if (value.length > MAX_TEXT_LENGTH) {
      throw badTemplate(`单段文本不能超过 ${MAX_TEXT_LENGTH} 个字符。`);
    }
    incrementNodeCounter(counter);
    return { type: "text", value };
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    throw badTemplate("模板中包含不支持的节点类型。");
  }

  const element = node as Element;
  const tag = element.localName;
  if (!safeTagSet.has(tag)) {
    throw badTemplate(`标签 <${tag}> 不在组件白名单中。`);
  }
  const safeTag = tag as SafeTag;
  if (parentTag && !allowedChildren[parentTag].has(safeTag)) {
    throw badTemplate(`<${safeTag}> 不能放在 <${parentTag}> 中。`);
  }

  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    if (!allowedAttributes[safeTag].has(attribute.name)) {
      throw badTemplate(
        `<${safeTag}> 不允许属性 ${attribute.name}；事件、指令和样式均被禁用。`,
      );
    }
    if (attribute.value.length > 160) {
      throw badTemplate(`属性 ${attribute.name} 的内容过长。`);
    }
    attributes[attribute.name] = attribute.value;
  }
  validateAttributeValues(safeTag, attributes);

  incrementNodeCounter(counter);
  const children = Array.from(element.childNodes)
    .map((child) => parseTemplateNode(child, safeTag, depth + 1, counter))
    .filter((child): child is SafeTemplateNode => child !== null);

  return {
    type: "element",
    tag: safeTag,
    attributes,
    children,
  };
}

function validateAttributeValues(
  tag: SafeTag,
  attributes: Readonly<Record<string, string>>,
) {
  if (tag === "remote-badge") {
    assertEnumValue(attributes.tone, [undefined, "info", "verified"], "tone");
  }
  if (tag === "remote-metric") {
    if (!attributes.label) throw badTemplate("<remote-metric> 必须提供 label。");
    assertEnumValue(attributes.source, ["count"], "source");
  }
  if (tag === "remote-button") {
    assertEnumValue(
      attributes.action,
      ["decrement", "increment", "reset"],
      "action",
    );
    assertEnumValue(
      attributes.variant,
      [undefined, "primary", "secondary"],
      "variant",
    );
    if (attributes.step !== undefined) {
      const step = Number(attributes.step);
      if (!Number.isSafeInteger(step) || step < 1 || step > 10) {
        throw badTemplate("step 必须是 1 到 10 之间的整数。");
      }
    }
    if (attributes.action === "reset" && attributes.step !== undefined) {
      throw badTemplate("reset 动作不能声明 step。");
    }
  }
}

function createRemoteVueComponent(parsed: ParsedRemoteVueFile): Component {
  return defineComponent({
    name: parsed.manifest.name,
    setup() {
      const count = ref(parsed.manifest.initialCount);
      const runtime = inject<RemoteRuntimeBridge | null>(
        REMOTE_RUNTIME_KEY,
        null,
      );

      const runAction = (action: string, stepValue?: string) => {
        const step = stepValue === undefined ? 1 : Number(stepValue);
        if (
          runtime?.isSuspended() ||
          !runtime?.authorizeAction({
            action: action as RemoteRuntimeAction["action"],
            step,
          })
        ) {
          return;
        }
        if (action === "increment") count.value += step;
        if (action === "decrement") count.value -= step;
        if (action === "reset") count.value = parsed.manifest.initialCount;
      };

      const renderNode = (
        node: SafeTemplateNode,
        key: string,
      ): VNodeChild => {
        if (node.type === "text") return node.value;

        const children = node.children.map((child, index) =>
          renderNode(child, `${key}-${index}`),
        );
        const attributes = node.attributes;

        switch (node.tag) {
          case "remote-card":
            return h("article", { class: "remote-card", key, part: "container" }, [
              h("div", { class: "remote-card__glow", "aria-hidden": "true" }),
              h("header", { class: "remote-card__header" }, [
                attributes.eyebrow
                  ? h("span", { class: "remote-card__eyebrow" }, attributes.eyebrow)
                  : null,
                h("h2", attributes.title || "远程组件"),
                attributes.description
                  ? h("p", attributes.description)
                  : null,
              ]),
              h("div", { class: "remote-card__body" }, children),
            ]);
          case "remote-badge":
            return h(
              "span",
              {
                class: [
                  "remote-badge",
                  `remote-badge--${attributes.tone ?? "info"}`,
                ],
                key,
              },
              children,
            );
          case "remote-text":
            return h("p", { class: "remote-text", key }, children);
          case "remote-metric":
            return h("div", { class: "remote-metric", key, part: "metric" }, [
              h("span", attributes.label),
              h("strong", String(count.value)),
            ]);
          case "remote-actions":
            return h("div", { class: "remote-actions", key }, children);
          case "remote-button":
            return h(
              "button",
              {
                class: [
                  "remote-button",
                  `remote-button--${attributes.variant ?? "secondary"}`,
                ],
                key,
                onClick: () =>
                  runAction(attributes.action ?? "", attributes.step),
                part:
                  attributes.variant === "primary"
                    ? "action primary-action"
                    : "action",
                type: "button",
              },
              children,
            );
        }
      };

      return () => renderNode(parsed.root, "remote-root");
    },
  });
}

function assertEnumValue(
  value: string | undefined,
  allowed: readonly (string | undefined)[],
  attributeName: string,
) {
  if (!allowed.includes(value)) {
    throw badTemplate(`${attributeName} 的值不在允许列表中。`);
  }
}

function incrementNodeCounter(counter: { value: number }) {
  counter.value += 1;
  if (counter.value > MAX_TEMPLATE_NODES) {
    throw badTemplate(`模板节点不能超过 ${MAX_TEMPLATE_NODES} 个。`);
  }
}

function isMeaningfulNode(node: Node) {
  return (
    node.nodeType === Node.ELEMENT_NODE ||
    (node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()))
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
) {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  field: string,
) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${field} 必须是正整数。`);
  }
  return value;
}

function badTemplate(message: string) {
  return new RemoteVueComponentError("BAD_TEMPLATE", message);
}

function badManifest(message: string) {
  return new RemoteVueComponentError("BAD_MANIFEST", message);
}
