<template>
  <remote-card title="请求额外权限的组件">
    <remote-text>这个组件尝试读取宿主用户偏好，但页面没有授予该能力。</remote-text>
  </remote-card>
</template>
<script type="application/json">
{
  "name": "PreferenceReader",
  "initialState": {
    "count": 0
  },
  "contract": {
    "protocolVersion": "1.0",
    "dependencies": {
      "vue": ">=3.5.0 &lt;4.0.0"
    },
    "capabilities": [
      "preference:read"
    ],
    "limits": {
      "domMutationsPerSecond": 20,
      "actionsPerMinute": 20
    }
  }
}
</script>
