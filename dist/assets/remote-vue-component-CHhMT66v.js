import{$ as e,A as t,C as n,E as r,F as i,L as a,O as o,P as s,R as c,T as l,Y as u,_ as d,_t as f,a as p,bt as m,c as h,f as g,i as _,m as v,o as y,p as b,q as x,s as S,t as C,v as w,w as T}from"./runtime-core.esm-bundler-DkML_vOj.js";import{d as ee,l as E,n as D,o as O}from"./index-X3oIGtop.js";var k=64*1024,A=8e3,j=64,M=6,N=500,P=new Set([`remote-card`,`remote-badge`,`remote-text`,`remote-metric`,`remote-actions`,`remote-button`]),F={"remote-card":new Set([`eyebrow`,`title`,`description`]),"remote-badge":new Set([`tone`]),"remote-text":new Set,"remote-metric":new Set([`label`,`source`]),"remote-actions":new Set,"remote-button":new Set([`action`,`step`,`variant`])},I={"remote-card":new Set([`remote-badge`,`remote-text`,`remote-metric`,`remote-actions`]),"remote-badge":new Set,"remote-text":new Set,"remote-metric":new Set,"remote-actions":new Set([`remote-button`]),"remote-button":new Set},L=new Set([`remote-badge`,`remote-text`,`remote-button`]),R=[`counter:read`,`counter:write`,`preference:read`],z=new Set(R),B=Symbol(`remote-vue-runtime`),V=class extends Error{code;constructor(e,t,n){super(t,{cause:n}),this.name=`RemoteVueComponentError`,this.code=e}};async function te(e,t={}){let n=new Set(t.allowedOrigins??[window.location.origin]),r=H(e,n),i=me(t.maxBytes,k,`maxBytes`),a=me(t.timeoutMs,A,`timeoutMs`),o=new AbortController,c=!1,l=()=>o.abort(t.signal?.reason);t.signal?.aborted?l():t.signal?.addEventListener(`abort`,l,{once:!0});let u=window.setTimeout(()=>{c=!0,o.abort()},a);try{let e=await fetch(r,{cache:`no-store`,credentials:r.origin===window.location.origin?`same-origin`:`omit`,headers:{Accept:`text/x-vue, text/plain;q=0.9, application/octet-stream;q=0.8`},redirect:`error`,signal:o.signal});if(!e.ok)throw new V(`BAD_STATUS`,`远程组件请求失败：HTTP ${e.status}`);let a=H(e.url,n),c=U(e.headers.get(`content-type`),a);W(e.headers.get(`content-length`),i);let l=await ne(e,i),u=await re(l.bytes);ie(u,t.expectedSha256);let d=ae(l.source);ce(d.manifest.contract,{grantedCapabilities:new Set(t.grantedCapabilities??[]),supportedProtocolVersions:new Set(t.supportedProtocolVersions??[`1.0`])});let f=le({contract:d.manifest.contract,expectedIntegrity:!!t.expectedSha256,finalUrl:a,templateNodes:d.templateNodes});return{component:fe(d),componentName:d.manifest.name,contentType:c,contract:d.manifest.contract,finalUrl:a.href,hostVueVersion:s,securityChecks:f,sha256:u,source:l.source,sourceBytes:l.bytes.byteLength,templateNodes:d.templateNodes}}catch(e){throw e instanceof V?e:o.signal.aborted?new V(c?`TIMEOUT`:`ABORTED`,c?`请求超过 ${a} ms，已取消。`:`远程组件请求已取消。`,e):new V(`FETCH_FAILED`,e instanceof Error?e.message:`无法获取远程组件。`,e)}finally{window.clearTimeout(u),t.signal?.removeEventListener(`abort`,l)}}function H(e,t){let n;try{n=new URL(e,window.location.href)}catch(e){throw new V(`UNSAFE_PROTOCOL`,`远程组件地址不是有效 URL。`,e)}if(n.protocol!==`http:`&&n.protocol!==`https:`)throw new V(`UNSAFE_PROTOCOL`,`不允许使用 ${n.protocol} 协议加载组件。`);if(n.origin!==window.location.origin&&n.protocol!==`https:`)throw new V(`UNSAFE_PROTOCOL`,`跨域远程组件必须通过 HTTPS 提供。`);if(!t.has(n.origin))throw new V(`ORIGIN_NOT_ALLOWED`,`来源 ${n.origin} 不在允许列表中。`);return n}function U(e,t){let n=e?.split(`;`,1)[0]?.trim().toLowerCase()??``;if(!n&&t.pathname.toLowerCase().endsWith(`.vue`))return`未提供（.vue）`;if(!new Set([`application/octet-stream`,`application/vue`,`text/plain`,`text/x-vue`]).has(n))throw new V(`BAD_CONTENT_TYPE`,`响应类型 ${n||`(缺失)`} 不允许作为远程组件。`);return n}function W(e,t){if(!e)return;let n=Number(e);if(Number.isFinite(n)&&n>t)throw new V(`PAYLOAD_TOO_LARGE`,`远程组件超过 ${t} 字节上限。`)}async function ne(e,t){if(!e.body)throw new V(`FETCH_FAILED`,`远程组件响应中没有可读取的正文。`);let n=e.body.getReader(),r=[],i=0;for(;;){let{done:e,value:a}=await n.read();if(e)break;if(i+=a.byteLength,i>t)throw await n.cancel(),new V(`PAYLOAD_TOO_LARGE`,`远程组件超过 ${t} 字节上限。`);r.push(a)}let a=new Uint8Array(i),o=0;for(let e of r)a.set(e,o),o+=e.byteLength;try{return{bytes:a,source:new TextDecoder(`utf-8`,{fatal:!0}).decode(a)}}catch(e){throw new V(`INVALID_ENCODING`,`远程组件必须使用有效的 UTF-8 编码。`,e)}}async function re(e){let t=await window.crypto.subtle.digest(`SHA-256`,e);return Array.from(new Uint8Array(t),e=>e.toString(16).padStart(2,`0`)).join(``)}function ie(e,t){if(!t)return;let n=t.toLowerCase().replace(/^sha256-/,``);if(!/^[a-f0-9]{64}$/.test(n))throw new V(`BAD_INTEGRITY`,`expectedSha256 必须是 64 位十六进制 SHA-256。`);if(e!==n)throw new V(`BAD_INTEGRITY`,`远程组件的 SHA-256 与可信版本不一致。`)}function ae(e){let t=new DOMParser().parseFromString(`<remote-sfc>${e}</remote-sfc>`,`application/xml`);if(t.getElementsByTagName(`parsererror`).length>0)throw Q(`远程组件不是结构完整的 XML 风格 SFC。`);let n=t.documentElement;if(n.localName!==`remote-sfc`)throw Q(`远程组件无法进入安全解析容器。`);let r=Array.from(n.children),i=r.filter(e=>e.localName===`template`),a=r.filter(e=>e.localName===`script`);if(r.length!==2||i.length!==1||a.length!==1)throw Q(`远程文件只能包含一个 <template> 和一个 application/json <script>。`);let o=i[0],s=a[0];if(!o||!s)throw Q(`无法读取远程组件模板。`);if(s.getAttribute(`type`)!==`application/json`)throw Q(`远程 <script> 只能承载 application/json，不能包含代码。`);if(s.attributes.length!==1)throw Q(`远程 manifest 的 <script> 不允许附加其他属性。`);if(o.attributes.length!==0)throw Q(`远程 <template> 不允许附加属性或 Vue 指令。`);let c=oe(s.textContent??``),l=Array.from(o.childNodes).filter(pe);if(l.length!==1)throw Q(`远程 <template> 必须且只能有一个根节点。`);let u={value:0},d=K(l[0],null,0,u);if(!d||d.type!==`element`||d.tag!==`remote-card`)throw Q(`远程模板根节点必须是 <remote-card>。`);return{manifest:c,root:d,templateNodes:u.value}}function oe(e){let t;try{t=JSON.parse(e)}catch(e){throw new V(`BAD_MANIFEST`,`远程组件 manifest 不是有效 JSON。`,e)}if(!Y(t)||!Z(t,[`name`,`initialState`,`contract`]))throw $(`manifest 只允许 name、initialState 和 contract 字段。`);if(typeof t.name!=`string`||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(t.name))throw $(`manifest.name 格式不合法。`);if(!Y(t.initialState)||!Z(t.initialState,[`count`])||!Number.isSafeInteger(t.initialState.count)||Number(t.initialState.count)<-999||Number(t.initialState.count)>999)throw $(`initialState.count 必须是 -999 到 999 之间的整数。`);return{contract:se(t.contract),name:t.name,initialCount:Number(t.initialState.count)}}function se(e){if(!Y(e)||!Z(e,[`protocolVersion`,`dependencies`,`capabilities`,`limits`]))throw $(`contract 必须完整声明 protocolVersion、dependencies、capabilities 和 limits。`);if(typeof e.protocolVersion!=`string`||!/^\d+\.\d+$/.test(e.protocolVersion))throw $(`contract.protocolVersion 必须使用 major.minor 格式。`);if(!Y(e.dependencies)||!Z(e.dependencies,[`vue`])||typeof e.dependencies.vue!=`string`||!/^>=\d+\.\d+\.\d+ <\d+\.\d+\.\d+$/.test(e.dependencies.vue))throw $(`contract.dependencies.vue 必须是形如 >=3.5.0 <4.0.0 的闭开版本范围。`);if(!Array.isArray(e.capabilities)||e.capabilities.length>R.length||e.capabilities.some(e=>typeof e!=`string`||!z.has(e))||new Set(e.capabilities).size!==e.capabilities.length)throw $(`contract.capabilities 包含未知或重复的能力。`);if(!Y(e.limits)||!Z(e.limits,[`domMutationsPerSecond`,`actionsPerMinute`])||!X(e.limits.domMutationsPerSecond,5,500)||!X(e.limits.actionsPerMinute,1,600))throw $(`contract.limits 必须声明有效的 DOM 变更速率和每分钟动作上限。`);return{protocolVersion:e.protocolVersion,dependencies:{vue:e.dependencies.vue},capabilities:e.capabilities,limits:{domMutationsPerSecond:Number(e.limits.domMutationsPerSecond),actionsPerMinute:Number(e.limits.actionsPerMinute)}}}function ce(e,t){if(!t.supportedProtocolVersions.has(e.protocolVersion))throw new V(`PROTOCOL_MISMATCH`,`远程协议 ${e.protocolVersion} 与宿主不兼容。`);if(!ue(`3.5.39`,e.dependencies.vue))throw new V(`DEPENDENCY_MISMATCH`,`宿主 Vue ${s} 不满足远程组件要求 ${e.dependencies.vue}。`);let n=e.capabilities.filter(e=>!t.grantedCapabilities.has(e));if(n.length>0)throw new V(`CAPABILITY_DENIED`,`宿主未授权远程组件能力：${n.join(`、`)}。`)}function le(e){return[{id:`transport`,label:`来源与传输`,status:`passed`,detail:`${e.finalUrl.origin} 已授权；跨域仅 HTTPS，禁止重定向。`},{id:`integrity`,label:`版本完整性`,status:e.expectedIntegrity?`passed`:`warning`,detail:e.expectedIntegrity?`SHA-256 与宿主固定的可信版本一致。`:`自定义地址未固定哈希，仍执行全部结构与权限校验。`},{id:`static-scan`,label:`AST 级静态扫描`,status:`passed`,detail:`${e.templateNodes} 个节点通过严格 XML AST、标签、属性和父子结构白名单。`},{id:`dependencies`,label:`依赖契约`,status:`passed`,detail:`宿主 Vue ${s} 满足 ${e.contract.dependencies.vue}，远程文件不携带 Vue 副本。`},{id:`capabilities`,label:`最小能力授权`,status:`passed`,detail:e.contract.capabilities.length?`仅授权 ${e.contract.capabilities.join(`、`)}。`:`组件未申请宿主能力。`},{id:`execution`,label:`不可执行远程代码`,status:`passed`,detail:`script 只允许 application/json；禁用 eval、指令、事件属性与动态 import。`}]}function ue(e,t){let n=t.match(/^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/);return!n?.[1]||!n[2]?!1:G(e,n[1])>=0&&G(e,n[2])<0}function G(e,t){let n=e.split(`.`).map(Number),r=t.split(`.`).map(Number);for(let e=0;e<3;e+=1){let t=(n[e]??0)-(r[e]??0);if(t!==0)return t}return 0}function K(e,t,n,r){if(n>M)throw Q(`模板嵌套不能超过 ${M} 层。`);if(e.nodeType===Node.COMMENT_NODE)return null;if(e.nodeType===Node.TEXT_NODE){let n=(e.textContent??``).replace(/\s+/g,` `).trim();if(!n)return null;if(!t||!L.has(t))throw Q(`<${t??`template`}> 中不允许直接放置文本。`);if(n.length>N)throw Q(`单段文本不能超过 ${N} 个字符。`);return J(r),{type:`text`,value:n}}if(e.nodeType!==Node.ELEMENT_NODE)throw Q(`模板中包含不支持的节点类型。`);let i=e,a=i.localName;if(!P.has(a))throw Q(`标签 <${a}> 不在组件白名单中。`);let o=a;if(t&&!I[t].has(o))throw Q(`<${o}> 不能放在 <${t}> 中。`);let s={};for(let e of Array.from(i.attributes)){if(!F[o].has(e.name))throw Q(`<${o}> 不允许属性 ${e.name}；事件、指令和样式均被禁用。`);if(e.value.length>160)throw Q(`属性 ${e.name} 的内容过长。`);s[e.name]=e.value}return de(o,s),J(r),{type:`element`,tag:o,attributes:s,children:Array.from(i.childNodes).map(e=>K(e,o,n+1,r)).filter(e=>e!==null)}}function de(e,t){if(e===`remote-badge`&&q(t.tone,[void 0,`info`,`verified`],`tone`),e===`remote-metric`){if(!t.label)throw Q(`<remote-metric> 必须提供 label。`);q(t.source,[`count`],`source`)}if(e===`remote-button`){if(q(t.action,[`decrement`,`increment`,`reset`],`action`),q(t.variant,[void 0,`primary`,`secondary`],`variant`),t.step!==void 0){let e=Number(t.step);if(!Number.isSafeInteger(e)||e<1||e>10)throw Q(`step 必须是 1 到 10 之间的整数。`)}if(t.action===`reset`&&t.step!==void 0)throw Q(`reset 动作不能声明 step。`)}}function fe(e){return v({name:e.manifest.name,setup(){let t=x(e.manifest.initialCount),n=w(B,null),r=(r,i)=>{let a=i===void 0?1:Number(i);n?.isSuspended()||!n?.authorizeAction({action:r,step:a})||(r===`increment`&&(t.value+=a),r===`decrement`&&(t.value-=a),r===`reset`&&(t.value=e.manifest.initialCount))},i=(e,n)=>{if(e.type===`text`)return e.value;let a=e.children.map((e,t)=>i(e,`${n}-${t}`)),o=e.attributes;switch(e.tag){case`remote-card`:return d(`article`,{class:`remote-card`,key:n,part:`container`},[d(`div`,{class:`remote-card__glow`,"aria-hidden":`true`}),d(`header`,{class:`remote-card__header`},[o.eyebrow?d(`span`,{class:`remote-card__eyebrow`},o.eyebrow):null,d(`h2`,o.title||`远程组件`),o.description?d(`p`,o.description):null]),d(`div`,{class:`remote-card__body`},a)]);case`remote-badge`:return d(`span`,{class:[`remote-badge`,`remote-badge--${o.tone??`info`}`],key:n},a);case`remote-text`:return d(`p`,{class:`remote-text`,key:n},a);case`remote-metric`:return d(`div`,{class:`remote-metric`,key:n,part:`metric`},[d(`span`,o.label),d(`strong`,String(t.value))]);case`remote-actions`:return d(`div`,{class:`remote-actions`,key:n},a);case`remote-button`:return d(`button`,{class:[`remote-button`,`remote-button--${o.variant??`secondary`}`],key:n,onClick:()=>r(o.action??``,o.step),part:o.variant===`primary`?`action primary-action`:`action`,type:`button`},a)}};return()=>i(e.root,`remote-root`)}})}function q(e,t,n){if(!t.includes(e))throw Q(`${n} 的值不在允许列表中。`)}function J(e){if(e.value+=1,e.value>j)throw Q(`模板节点不能超过 ${j} 个。`)}function pe(e){return e.nodeType===Node.ELEMENT_NODE||e.nodeType===Node.TEXT_NODE&&!!e.textContent?.trim()}function Y(e){return typeof e==`object`&&!!e&&!Array.isArray(e)}function X(e,t,n){return typeof e==`number`&&Number.isSafeInteger(e)&&e>=t&&e<=n}function Z(e,t){let n=Object.keys(e);return n.length===t.length&&n.every(e=>t.includes(e))}function me(e,t,n){if(e===void 0)return t;if(!Number.isSafeInteger(e)||e<=0)throw RangeError(`${n} 必须是正整数。`);return e}function Q(e){return new V(`BAD_TEMPLATE`,e)}function $(e){return new V(`BAD_MANIFEST`,e)}var he=[`data-sandbox-state`],ge=D(v({__name:`RemoteComponentBoundary`,props:{component:{},contract:{},styleText:{}},emits:[`audit`,`ready`,`suspended`],setup(e,{emit:t}){let a=e,o=t,s=x(null),c=null,l=null,u=null,d=null,f=x(`idle`),p=``,m=0,g=0,_=0,v=0,y=0,b=[];function S(){return{managedResources:f.value===`running`?2:0,peakDomMutationsPerSecond:y,remoteNetworkRequests:0,remoteTimers:0,startedAt:p,state:f.value,totalActions:m,totalDomMutations:g}}function C(){o(`audit`,S())}function w(){p=new Date().toISOString(),m=0,g=0,_=0,v=performance.now(),y=0,b=[]}function ee(e=performance.now()){e-v<1e3||(y=Math.max(y,_),_=0,v=e,C())}function E(){d!==null&&(window.clearInterval(d),d=null),u?.disconnect(),u=null,l?.unmount(),l=null}function D(e){if(f.value!==`running`)return;if(f.value=`suspended`,E(),c){let t=document.createElement(`div`);t.className=`boundary-fallback`,t.textContent=`组件已熔断：${e}`,c.querySelector(`.remote-mount`)?.replaceWith(t)}let t=S();o(`audit`,t),o(`suspended`,{reason:e,snapshot:t})}let k={authorizeAction(e){if(f.value!==`running`)return!1;let t=Date.now();return b=b.filter(e=>t-e<6e4),b.length>=a.contract.limits.actionsPerMinute?(D(`每分钟动作数超过 ${a.contract.limits.actionsPerMinute} 次预算`),!1):(b.push(t),m+=1,C(),!0)},isSuspended(){return f.value===`suspended`}};function A(){let e=s.value;if(!e)return;E(),c??=e.attachShadow({mode:`open`,delegatesFocus:!0}),c.replaceChildren();let t=document.createElement(`style`);t.textContent=a.styleText;let n=document.createElement(`div`);n.className=`remote-mount`,c.append(t,n),w(),f.value=`running`,u=new MutationObserver(e=>{let t=e.length;if(g+=t,_+=t,y=Math.max(y,_),_>a.contract.limits.domMutationsPerSecond){D(`DOM 变更超过 ${a.contract.limits.domMutationsPerSecond} 次/秒预算`);return}C()}),u.observe(n,{attributes:!0,characterData:!0,childList:!0,subtree:!0}),l=O(a.component),l.provide(B,k),l.config.errorHandler=e=>{D(e instanceof Error?e.message:`远程组件运行异常`)};try{l.mount(n),d=window.setInterval(()=>ee(),250),C(),o(`ready`)}catch(e){D(e instanceof Error?e.message:`远程组件挂载失败`)}}return T(A),i(()=>a.component,()=>A()),n(()=>{E(),f.value=`unmounted`,C(),c?.replaceChildren()}),(e,t)=>(r(),h(`div`,{ref_key:`hostElement`,ref:s,class:`remote-component-host`,"data-sandbox-state":f.value},null,8,he))}}),[[`__scopeId`,`data-v-6e8ecb13`]]),_e=`
  :host {
    display: block;
    width: min(510px, 100%);
    color-scheme: dark;
    contain: layout style paint;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  button {
    font: inherit;
  }

  .remote-card {
    position: relative;
    width: 100%;
    padding: clamp(22px, 4vw, 34px);
    overflow: hidden;
    color: #eaf3ff;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    background:
      linear-gradient(145deg, rgb(24 50 81 / 97%), rgb(12 29 51 / 99%)),
      #10243b;
    border: 1px solid rgb(129 177 225 / 28%);
    border-radius: 18px;
    box-shadow:
      0 24px 50px rgb(13 34 58 / 22%),
      inset 0 1px rgb(255 255 255 / 8%);
  }

  .remote-card__glow {
    position: absolute;
    top: -100px;
    right: -80px;
    width: 260px;
    height: 260px;
    background: radial-gradient(circle, rgb(72 155 255 / 26%), transparent 70%);
    pointer-events: none;
  }

  .remote-card__header,
  .remote-card__body {
    position: relative;
  }

  .remote-card__eyebrow {
    color: #70aef4;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.18em;
  }

  .remote-card h2 {
    margin: 8px 0 0;
    color: #eaf3ff;
    font-size: clamp(20px, 3vw, 27px);
    font-weight: 680;
    letter-spacing: -0.025em;
  }

  .remote-card__header p {
    max-width: 420px;
    margin: 9px 0 0;
    color: #9db0c6;
    font-size: 10px;
    line-height: 1.7;
  }

  .remote-card__body {
    margin-top: 21px;
  }

  .remote-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    color: #6fe0b6;
    font-size: 8px;
    font-weight: 700;
    background: rgb(35 175 127 / 10%);
    border: 1px solid rgb(77 213 166 / 20%);
    border-radius: 7px;
  }

  .remote-badge::before {
    width: 5px;
    height: 5px;
    content: "";
    background: #44d19f;
    border-radius: 50%;
  }

  .remote-text {
    margin: 14px 0 0;
    color: #91a5bc;
    font-size: 10px;
    line-height: 1.7;
  }

  .remote-metric {
    display: flex;
    align-items: end;
    justify-content: space-between;
    margin-top: 17px;
    padding: 14px 16px;
    background: rgb(255 255 255 / 5%);
    border: 1px solid rgb(255 255 255 / 7%);
    border-radius: 11px;
  }

  .remote-metric span {
    color: #91a6bc;
    font-size: 9px;
  }

  .remote-metric strong {
    color: #ffffff;
    font-size: 28px;
    font-weight: 620;
    line-height: 1;
  }

  .remote-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 13px;
  }

  .remote-button {
    min-height: 34px;
    padding: 0 12px;
    color: #b9c9da;
    font-size: 9px;
    font-weight: 700;
    background: rgb(255 255 255 / 5%);
    border: 1px solid rgb(255 255 255 / 10%);
    border-radius: 8px;
    cursor: pointer;
    transition: 140ms ease;
  }

  .remote-button:hover {
    color: #ffffff;
    background: rgb(255 255 255 / 9%);
    transform: translateY(-1px);
  }

  .remote-button--primary {
    color: #ffffff;
    background: linear-gradient(135deg, #2475d7, #45a0ef);
    border-color: transparent;
    box-shadow: 0 7px 18px rgb(31 113 204 / 22%);
  }

  .boundary-fallback {
    padding: 24px;
    color: #ffbbc1;
    font: 600 12px/1.7 Inter, ui-sans-serif, system-ui, sans-serif;
    text-align: center;
    background: #291c29;
    border: 1px solid #70404c;
    border-radius: 14px;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      transition-duration: 0.01ms !important;
    }
  }
`,ve={class:`remote-demo`},ye={class:`demo-header`},be={class:`control-bar`,"aria-label":`远程组件加载控制`},xe={class:`url-field`},Se=[`disabled`],Ce={class:`workspace`},we={class:`preview-panel`},Te={class:`panel-heading`},Ee=[`aria-pressed`],De={key:0,class:`state-view loading-view`},Oe={key:1,class:`state-view error-view`},ke={class:`error-code`},Ae={class:`security-panel`},je={class:`panel-heading`},Me={key:0,class:`checked-time`},Ne={key:0,class:`security-list`},Pe={key:1,class:`security-empty`},Fe={key:2,class:`result-meta`},Ie={key:3,class:`audit-card`,"aria-label":`远程组件行为审计`},Le={class:`audit-heading`},Re={class:`audit-grid`},ze={key:0},Be={class:`source-panel`},Ve={class:`source-heading`},He={key:0,class:`hash-label`},Ue=`7fb8c49a663395abf745a1cd1f4483393d3255f7570281980e0cd2746ae35d5d`,We=D(v({__name:`index`,setup(n){let i=`/remote-components/safe-counter.vue`,s=[window.location.origin],d=[`counter:read`,`counter:write`],v=x(i),w=x(`idle`),D=x(``),O=x(``),k=x(``),A=u(null),j=x(!1),M=x(``),N=x({managedResources:0,peakDomMutationsPerSecond:0,remoteNetworkRequests:0,remoteTimers:0,startedAt:``,state:`idle`,totalActions:0,totalDomMutations:0}),P=null,F=_(()=>w.value===`loading`?`正在验证`:w.value===`ready`?`已安全挂载`:w.value===`error`?`已拒绝`:w.value===`suspended`?`已熔断`:`等待加载`);async function I(e=v.value,t=d){let n=e.trim();if(n){v.value=n,P?.abort(),P=new AbortController,w.value=`loading`,D.value=``,O.value=``,A.value=null,M.value=``,N.value={...N.value,managedResources:0,state:`idle`,totalActions:0,totalDomMutations:0};try{let e=new URL(n,window.location.href).href===new URL(i,window.location.href).href,r=await te(n,{allowedOrigins:s,expectedSha256:e?Ue:void 0,grantedCapabilities:t,maxBytes:64*1024,signal:P.signal,supportedProtocolVersions:[`1.0`],timeoutMs:8e3});A.value=r,w.value=`ready`}catch(e){if(e instanceof V){if(e.code===`ABORTED`)return;D.value=e.code,O.value=e.message}else D.value=`UNKNOWN`,O.value=e instanceof Error?e.message:`加载远程组件时发生未知错误。`;w.value=`error`}finally{k.value=new Intl.DateTimeFormat(`zh-CN`,{hour:`2-digit`,minute:`2-digit`,second:`2-digit`}).format(new Date)}}}function L(){I(i)}function R(){I(`/remote-components/blocked-example.vue`)}function z(){I(`/remote-components/incompatible-version.vue`)}function B(){I(`/remote-components/capability-escalation.vue`)}function H(){I(`/remote-components/behavior-limit.vue`)}function U(e){N.value=e}function W(e){M.value=e.reason,N.value=e.snapshot,w.value=`suspended`}return T(L),l(()=>{P?.abort()}),(n,i)=>{let s=t(`RouterLink`);return r(),h(`main`,ve,[i[27]||=p(`div`,{class:`ambient ambient--left`,"aria-hidden":`true`},null,-1),i[28]||=p(`div`,{class:`ambient ambient--right`,"aria-hidden":`true`},null,-1),p(`header`,ye,[b(s,{class:`back-link`,to:`/`,"aria-label":`返回示例列表`},{default:a(()=>[...i[4]||=[p(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`},[p(`path`,{d:`m14 6-6 6 6 6`})],-1)]]),_:1}),i[6]||=p(`div`,{class:`header-copy`},[p(`span`,null,`VUE RUNTIME LAB`),p(`h1`,null,`远程组件，三层零信任加载`),p(`p`,null,`Shadow DOM 隔离 · 依赖与能力契约 · 静态扫描与行为审计`)],-1),p(`div`,{class:f([`status-pill`,`is-${w.value}`])},[i[5]||=p(`i`,{"aria-hidden":`true`},null,-1),g(` `+m(F.value),1)],2)]),p(`section`,be,[i[9]||=p(`label`,{for:`remote-component-url`},`组件地址`,-1),p(`div`,xe,[i[7]||=p(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`},[p(`path`,{d:`M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1`}),p(`path`,{d:`M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1`})],-1),c(p(`input`,{id:`remote-component-url`,"onUpdate:modelValue":i[0]||=e=>v.value=e,type:`text`,autocomplete:`off`,spellcheck:`false`,onKeyup:i[1]||=ee(e=>I(),[`enter`])},null,544),[[E,v.value]])]),p(`button`,{class:`load-button`,type:`button`,disabled:w.value===`loading`,onClick:i[2]||=e=>I()},[i[8]||=p(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`},[p(`path`,{d:`M12 3v12m0 0 4-4m-4 4-4-4`}),p(`path`,{d:`M5 20h14`})],-1),g(` `+m(w.value===`loading`?`验证中`:`获取并渲染`),1)],8,Se)]),p(`div`,Ce,[p(`section`,we,[p(`div`,Te,[i[10]||=p(`div`,null,[p(`span`,{class:`panel-kicker`},`RENDER OUTPUT`),p(`h2`,null,`宿主渲染区`)],-1),p(`button`,{class:f([`probe-toggle`,{"is-active":j.value}]),type:`button`,"aria-pressed":j.value,onClick:i[3]||=e=>j.value=!j.value},` 宿主 CSS 污染测试 `,10,Ee)]),p(`div`,{class:f([`render-canvas`,{"host-style-pollution":j.value}])},[w.value===`loading`?(r(),h(`div`,De,[...i[11]||=[p(`span`,{class:`loader`,"aria-hidden":`true`},null,-1),p(`strong`,null,`正在建立信任链`,-1),p(`p`,null,`校验来源、响应、哈希、manifest 与模板能力。`,-1)]])):w.value===`error`?(r(),h(`div`,Oe,[i[12]||=p(`span`,{class:`error-icon`,"aria-hidden":`true`},[p(`svg`,{viewBox:`0 0 24 24`},[p(`path`,{d:`M12 8v5m0 3.5v.5`}),p(`path`,{d:`M10.3 4.2 3.1 17a2 2 0 0 0 1.8 3h14.2a2 2 0 0 0 1.8-3L13.7 4.2a2 2 0 0 0-3.4 0Z`})])],-1),p(`span`,ke,m(D.value),1),i[13]||=p(`strong`,null,`远程组件已被拒绝`,-1),p(`p`,null,m(O.value),1),p(`button`,{type:`button`,onClick:L},`恢复安全示例`)])):A.value?(r(),y(ge,{key:2,class:`remote-boundary`,component:A.value.component,contract:A.value.contract,"style-text":e(_e),onAudit:U,onSuspended:W},null,8,[`component`,`contract`,`style-text`])):S(``,!0)],2),p(`div`,{class:`test-row`},[i[14]||=p(`div`,null,[p(`strong`,null,`主动验证三类拒绝路径`),p(`span`,null,`静态扫描、依赖协商与能力授权均采用失败关闭。`)],-1),p(`div`,{class:`test-actions`},[p(`button`,{type:`button`,onClick:R},` 危险代码 `),p(`button`,{type:`button`,onClick:z},` 版本不兼容 `),p(`button`,{type:`button`,onClick:B},` 越权能力 `),p(`button`,{type:`button`,onClick:H},` 行为熔断 `)])])]),p(`aside`,Ae,[p(`div`,je,[i[15]||=p(`div`,null,[p(`span`,{class:`panel-kicker`},`TRUST BOUNDARY`),p(`h2`,null,`安全检查`)],-1),k.value?(r(),h(`span`,Me,m(k.value),1)):S(``,!0)]),A.value?(r(),h(`ol`,Ne,[(r(!0),h(C,null,o(A.value.securityChecks,e=>(r(),h(`li`,{key:e.id,class:f(e.status===`passed`?`is-pass`:`is-neutral`)},[i[16]||=p(`span`,null,[p(`i`)],-1),p(`div`,null,[p(`strong`,null,m(e.label),1),p(`p`,null,m(e.detail),1)])],2))),128))])):(r(),h(`div`,Pe,` 加载后展示来源、完整性、AST、依赖、能力和代码执行检查。 `)),A.value?(r(),h(`dl`,Fe,[p(`div`,null,[i[17]||=p(`dt`,null,`组件`,-1),p(`dd`,null,m(A.value.componentName),1)]),p(`div`,null,[i[18]||=p(`dt`,null,`大小`,-1),p(`dd`,null,m(A.value.sourceBytes)+` B`,1)]),p(`div`,null,[i[19]||=p(`dt`,null,`协议`,-1),p(`dd`,null,m(A.value.contract.protocolVersion),1)]),p(`div`,null,[i[20]||=p(`dt`,null,`宿主 Vue`,-1),p(`dd`,null,m(A.value.hostVueVersion),1)])])):S(``,!0),A.value?(r(),h(`section`,Ie,[p(`div`,Le,[p(`div`,null,[i[21]||=p(`span`,null,`BEHAVIOR AUDIT`,-1),p(`strong`,null,m(N.value.state===`suspended`?`已熔断`:`实时审计`),1)]),p(`i`,{class:f({"is-alert":N.value.state===`suspended`})},null,2)]),p(`dl`,Re,[p(`div`,null,[i[22]||=p(`dt`,null,`DOM 变更`,-1),p(`dd`,null,m(N.value.totalDomMutations),1)]),p(`div`,null,[i[23]||=p(`dt`,null,`能力调用`,-1),p(`dd`,null,m(N.value.totalActions),1)]),p(`div`,null,[i[24]||=p(`dt`,null,`网络请求`,-1),p(`dd`,null,m(N.value.remoteNetworkRequests),1)]),p(`div`,null,[i[25]||=p(`dt`,null,`远程定时器`,-1),p(`dd`,null,m(N.value.remoteTimers),1)])]),M.value?(r(),h(`p`,ze,m(M.value),1)):S(``,!0),p(`small`,null,` 行为预算：`+m(A.value.contract.limits.domMutationsPerSecond)+` 次 DOM/秒 · `+m(A.value.contract.limits.actionsPerMinute)+` 次动作/分钟 `,1)])):S(``,!0)])]),p(`section`,Be,[p(`div`,Ve,[i[26]||=p(`div`,null,[p(`span`,{class:`panel-kicker`},`REMOTE SOURCE`),p(`h2`,null,`接收到的 .vue 文件`)],-1),A.value?(r(),h(`span`,He,` SHA-256 · `+m(A.value.sha256.slice(0,12))+`… `,1)):S(``,!0)]),p(`pre`,null,[p(`code`,null,m(A.value?.source||`加载并通过校验后，远程源码会显示在这里。`),1)])])])}}}),[[`__scopeId`,`data-v-e72bac51`]]);export{We as default};