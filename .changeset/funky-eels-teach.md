---
title: v0.3.0
description: change event now includes path and op metadata.
---

# v0.3.0

## Changed

- change event now receives path and op as second and third arguments:
	change(state, path, op) instead of change(state)
- pathcomplete signature unchanged: pathcomplete(path, value)
- pathstart signature unchanged: pathstart(path, value)

## Migration

```typescript
// Before
collector.on('change', (state) => render(state))

// After
collector.on('change', (state, path, op) => {
	render(state)
})
```
