<template>
  <remote-card
    eyebrow="REMOTE / PUBLIC"
    title="受控远程计数器"
    description="这个界面来自运行时拉取的 .vue 文件，但交互能力由宿主应用授权。"
  >
    <remote-badge tone="verified">已通过来源、完整性与模板白名单校验</remote-badge>
    <remote-text>远程文件只能声明宿主允许的组件、文字和动作，不能携带或执行 JavaScript。</remote-text>
    <remote-metric label="已确认事件" source="count"></remote-metric>
    <remote-actions>
      <remote-button action="decrement" step="1">减少 1</remote-button>
      <remote-button action="increment" step="1" variant="primary">增加 1</remote-button>
      <remote-button action="reset">重置</remote-button>
    </remote-actions>
  </remote-card>
</template>
<script type="application/json">
{
  "name": "PublicSafeCounter",
  "initialState": {
    "count": 12
  },
  "contract": {
    "protocolVersion": "1.0",
    "dependencies": {
      "vue": ">=3.5.0 &lt;4.0.0"
    },
    "capabilities": [
      "counter:read",
      "counter:write"
    ],
    "limits": {
      "domMutationsPerSecond": 40,
      "actionsPerMinute": 120
    }
  }
}
</script>
