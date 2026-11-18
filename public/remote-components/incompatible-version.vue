<template>
  <remote-card title="不兼容的远程组件">
    <remote-text>这个组件要求宿主提供未来版本的 Vue。</remote-text>
  </remote-card>
</template>
<script type="application/json">
{
  "name": "FutureVueComponent",
  "initialState": {
    "count": 0
  },
  "contract": {
    "protocolVersion": "1.0",
    "dependencies": {
      "vue": ">=4.0.0 &lt;5.0.0"
    },
    "capabilities": [],
    "limits": {
      "domMutationsPerSecond": 20,
      "actionsPerMinute": 20
    }
  }
}
</script>
