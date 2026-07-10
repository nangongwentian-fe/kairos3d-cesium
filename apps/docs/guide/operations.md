# Operations And Loading

Use `map.operations` to observe and cancel long-running SDK work without coupling an application to individual managers.

## Summary

| Capability | Behavior |
| --- | --- |
| Status | `running`, `succeeded`, `failed`, or `canceled`. |
| Progress | Monotonic `0–1` progress with an optional phase key. |
| Cancellation | Uses `AbortSignal`; canceled promises reject with `OperationCanceledError`. |
| Retention | Keeps at most 100 finished records until they are cleared or evicted. |
| Ownership | Operations are runtime diagnostics, not scene snapshots or analysis results. |

## Common Path

```ts
import { isOperationCanceledError } from "@kairos3d/cesium/operations";

const controller = new AbortController();
const loadPromise = map.layers.load(configs, {
  clear: true,
  signal: controller.signal,
  operationId: "load-city"
});

const off = map.operations.on("change", (event) => {
  const operation = event.data;
  console.log(operation.kind, operation.status, operation.progress, operation.phase);
});

map.operations.cancel("load-city");

try {
  await loadPromise;
} catch (error) {
  if (!isOperationCanceledError(error)) {
    throw error;
  }
} finally {
  off();
}
```

Use `get()` for one operation or filter the retained records:

```ts
const running = map.operations.list({ status: "running" });
const failedLoads = map.operations.list({
  kind: "layers.load",
  status: "failed"
});

map.operations.cancelAll({ kind: "analysis.profile" });
map.operations.clearFinished();
```

## Integrated APIs

| API | Kind |
| --- | --- |
| `map.layers.load()` | `layers.load` |
| `map.effects.add/update/load()` | `effects.add`, `effects.update`, `effects.load` |
| `map.sceneState.load()` | `scene.load` |
| `map.analysis.visibility.compute()` | `analysis.visibility` |
| `map.analysis.profile.compute()` | `analysis.profile` |
| Terrain compute methods | `analysis.terrain.<type>` |

Existing return values are unchanged. APIs with an existing options object accept `signal` and `operationId` there; Effects add/update and programmatic analysis compute methods accept a final operation-options argument.

## Cancellation Rules

- Cancellation is cooperative. Cesium requests without native abort support may finish in the background, but their late results are not committed.
- A manager keeps its pending/load concurrency lock until that background cleanup finishes, even though the public promise rejects immediately.
- Prepared Effects runtime objects are destroyed after cancellation. A canceled or failed Effect update keeps the old runtime active.
- Layer loads remove layers added by that invocation after cancellation or failure.
- Interactive visibility, profile, and terrain tools abort their in-flight compute work when the tool stops or is canceled.
- `map.destroy()` cancels operations before destroying the remaining managers and suppresses late operation events.

## Current Limits

- Scene recovery is not transactional yet. Canceling `sceneState.load()` stops later phases but does not roll back phases that already completed.
- `layers.load({ clear: true })` does not restore the old layer set after cancellation.
- Operations are not serialized into `SceneSnapshot`, `map.results`, picking, selection, or layer ownership.
- Worker scheduling and an Operations Widget are outside M9.

## Verification

```powershell
pnpm --filter @kairos3d/cesium typecheck
pnpm --filter @kairos3d/cesium test
pnpm --filter @kairos3d/cesium build
```

## Related Docs

- [Architecture](./architecture.md)
- [Roadmap](./roadmap.md)
