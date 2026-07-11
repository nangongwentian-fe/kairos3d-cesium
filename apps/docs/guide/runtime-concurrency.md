# Runtime Concurrency

Use `map.concurrency` to observe runtime mutations and wait until SDK-managed resources become idle. Lease acquisition remains internal to Core; applications keep calling the owning manager APIs.

## Summary

| Capability | Contract |
| --- | --- |
| Ordinary mutation | Acquires a resource write lease and rejects immediately on conflict. |
| Scene recovery | Acquires one scene-wide exclusive lease in both transactional and progressive modes. |
| Fairness | A waiting Scene load reserves exclusivity, so later ordinary mutations cannot starve it. |
| Cancellation | Waiting can be canceled; active work keeps its lease until late runtime cleanup finishes. |
| Ownership | Leases are runtime coordination state, not Operations history, Results, or SceneSnapshot data. |

## Observe Runtime Mutations

```ts
import type {
  RuntimeLeaseState,
  RuntimeResource
} from "@kairos3d/cesium/concurrency";

const off = map.concurrency.on("change", (event) => {
  for (const lease of event.data.leases) {
    console.log(lease.kind, lease.status, lease.resources);
  }
});

const layerBusy = map.concurrency.isBusy("layers");
const waiting = map.concurrency.list({ status: "waiting" });

await map.concurrency.whenIdle({ resource: "effects" });
off();
```

`list()` returns immutable snapshots ordered by request time. `whenIdle()` accepts an optional abort signal:

```ts
await map.concurrency.whenIdle(
  { resource: "scene" },
  { signal: controller.signal }
);
```

## Scene Conflict Policy

Scene recovery waits for active mutations by default:

```ts
await map.sceneState.load(snapshot, {
  mode: "transactional",
  conflictPolicy: "wait"
});
```

Use `reject` when the caller must fail immediately instead of waiting:

```ts
await map.sceneState.load(snapshot, {
  conflictPolicy: "reject"
});
```

The rejected promise throws `RuntimeMutationConflictError` with the conflicting resource and, when available, an immutable holder snapshot.

## Operations Versus Leases

| Operations | Concurrency leases |
| --- | --- |
| Reports business progress, success, failure, and cancellation. | Guards access to SDK-managed runtime resources. |
| A canceled public promise becomes `canceled` immediately. | The active lease remains until late Cesium work and temporary runtime cleanup finish. |
| Keeps bounded finished history. | Contains only waiting or active leases and disappears when work is actually idle. |

For stable post-cancellation inspection, wait for the relevant runtime resource or for Scene recovery:

```ts
await map.concurrency.whenIdle({ resource: "effects" });
await map.sceneState.whenIdle();
```

## Boundaries

- Applications cannot acquire arbitrary leases or run tasks through `map.concurrency`.
- Different ordinary resources can mutate concurrently; the owning manager still defines same-resource business rules.
- A public mutation keeps its lease through index/runtime updates and emitted manager events. Same-resource listener re-entry is rejected, and batch APIs keep one lease for the complete batch.
- Scene preflight validates all built-in sections before detached runtime creation. A custom layer adapter without `transaction.preflight()` can still load, but Core can only guarantee cleanup after its prepare step fails.
- Scene finalize is best-effort. A committed transaction remains successful when old-runtime cleanup reports diagnostics through `cleanupStatus` and `cleanupErrors`.
- Business-created Cesium objects outside SDK managers are not protected.

## Related Docs

- [Operations And Loading](./operations.md)
- [Transactional Scene Recovery](./scene-transactions.md)
- [Architecture](./architecture.md)
