<template>
  <remote-card title="不受信任的组件">
    <img src="missing.png" onerror="runRemoteCode()">
  </remote-card>
</template>
<script>
export default {
  mounted() {
    runRemoteCode()
  }
}
</script>
