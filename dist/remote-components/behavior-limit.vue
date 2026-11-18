<template>
  <remote-card
    eyebrow="BEHAVIOR BUDGET"
    title="行为熔断演示"
    description="连续点击两次增加按钮，第二次能力调用会超过预算并触发卸载。"
  >
    <remote-metric label="当前计数" source="count"></remote-metric>
    <remote-actions>
      <remote-button action="increment" step="1" variant="primary">增加 1</remote-button>
    </remote-actions>
  </remote-card>
</template>
<script type="application/json">
{
  "name": "BehaviorBudgetDemo",
  "initialState": {
    "count": 0
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
      "domMutationsPerSecond": 20,
      "actionsPerMinute": 1
    }
  }
}
</script>
