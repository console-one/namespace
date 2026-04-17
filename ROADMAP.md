# Roadmap

What v0.1 ships and what remains to build. This document is forward-looking: it's a task list for turning the current package into the full namespace fabric the architecture docs describe, not a log of what was cut.

## What v0.1 ships

- **Path / Version / PathReference** — dual-mode addressing (version vs. stage), URL-style params, path-type inference
- **TimelineKey** — `type:key:seq` identifier with string and JSON round-trips
- **Metric + Metric.Builder** — declarative partition specification
- **Monitor** — the range-queryable indexer (add / remove / state / retrieve / readKeys / partitions / has / canRetrieve)
- **Ingestor** — classifier-driven index updater
- Storage adapters: `PartitionMap`, `SortedSet` interfaces + `InMemory*` reference impls

That covers "given an artifact and its metadata, index it and range-query it." It does not cover "given a TimelineKey, load the actual artifact bytes" — that's what the Storage layer is for, and it's next.

## v0.2: `Storage` + `Index` coordinator

The Storage layer maps `TimelineKey` → stored payload. Every artifact type (source, deployment, program, prompt, response) gets its own blob store with its own serializer. The `Index` class wraps Monitor + Storage so callers say `index.save(artifact)` and `index.load(tlkey)` without wiring up both halves.

**What to build:**

1. **`Storage.BlobStore`** interface (likely shaped like the one in `@console-one/source`): `read` / `save` / `has` / `delete` keyed by flat path strings. Reference impl: `InMemoryBlobStore` holding a `Map<string, string>`.
2. **`Storage<T>` class** — pairs a `BlobStore` with per-type `atob`/`btoa` serializers. Methods: `save(tlkey, obj)`, `load(tlkey)`, `has(tlkey)`, `delete(tlkey)`.
3. **`Index` class** — coordinates Monitor + Storage. Methods: `save(obj)` (runs Ingestor + Storage.save), `load(tlkey)`, `last(metric, partition)`, `has(tlkey)`, `read(...)` as an async generator that streams artifacts in a sequence window.
4. Smoke coverage: `Index.save(file)` then `Index.load(tlkey)` roundtrips, `Index.last(metric, partition)` returns the most recent artifact, `Index.read(...)` streams a window.

**Starting material:** `core/namespace/indexing/storage.ts` + `core/namespace/indexing/index.ts` in the source monorepo. `storage.ts` ties a `BlobStore`-like adapter (source calls it `S3Dao`) to per-type serializers through a Redis-backed update DAO. `index.ts` is the coordinator with `.save()` / `.load()` / `.read()` methods, plus a DI-registry factory to drop.

## v0.3: `Authorizer` — hierarchical permission composition

Permissions cascade down a path hierarchy. When resolving `/workspace/src/main.ts`, the Authorizer looks for a permission TimelineKey at `/`, `/workspace`, `/workspace/src`, and `/workspace/src/main.ts`, then ANDs them. Permissions cascade downward; restrictions compound upward.

**What to build:**

1. Port `core/namespace/authorizer.ts`. It's short (~70 lines) but none of it compiles in the source — `PartitionMap`, `TimelineKey`, `AssessableJSON`, `and` are all used without imports. Add the imports and fix the type plumbing.
2. Decide whether the Authorizer depends on `@console-one/assessable` directly (uses `AssessableJSON` as `Requirements` and combines via `and()`) or just takes an opaque `tester` with a `.test(spec)` method.
3. Smoke: build an Authorizer with permission TimelineKeys at `/` and `/workspace`, resolve for `/workspace/secret.ts`, verify that both get ANDed into the returned validator.

## v0.4: `Monitor.next()` subscriptions — "wake me when the partition changes"

`Monitor.next()` is in the current code but the subscription wiring is subtle and the smoke test doesn't exercise it. The use case: a process calls `await monitor.next('workspace-artifact', partition)` and gets resolved only when a new TimelineKey lands on that partition.

**What to build:**

1. Port the subscription plumbing from `@console-one/subscription`. `Monitor` already holds a `subscriptions: Map<MetricPartition, Subscription<TimelineKey>>` but doesn't expose a clean public API.
2. Decide listener encoding in the `listeners` PartitionMap — the source uses comma-separated strings (`"NEXT,OTHER,NEXT"`) which is ugly and doesn't dedupe; a Set serialization would be cleaner.
3. Smoke: open a subscription, push a TimelineKey, assert the subscription resolves with it.

## v0.5: Classifier/Requirements decoupling

The Ingestor currently depends on `ClassifierBuilder` from `@console-one/assessable`. That's fine but means anyone using the Ingestor must pull in assessable. For callers who just want "given an object and partition paths, extract keys and record them," a simpler `IngestPipeline` interface would decouple.

**What to build:**

1. Extract the `ClassifierBuilder`-using surface of Ingestor into an optional subpath export (`@console-one/namespace/classifier`).
2. Add a plain `Ingestor.walk(obj, metric)` method that returns `Promise<Arguments>` without a classifier — useful for synchronous one-shot indexing.
3. The `Metric.filter` (Requirements) feature similarly ties to assessable. Consider whether the filter should just be a `(obj: any) => boolean` predicate at the namespace layer, and let callers bring their own Requirements-to-predicate compiler.

## Source repo references

Files from the source monorepo `console-one-workspace/web-server/server/core/namespace/` not included in v0.1:

- `indexing/storage.ts` — pairs a blob store with per-artifact-type serializers. Entangled with `source/Dao` and specific artifact types. Start material for v0.2.
- `indexing/index.ts` — `Index` coordinator class. Uses `Storage` + Monitor + Ingestor. Start material for v0.2.
- `indexing/__indexes.ts` — declares the specific artifacts Console One indexes (source, deployment, program, prompt, response). Application-specific; library users declare their own.
- `indexing/timelines.ts` — doesn't compile (imports a `./partition` module that doesn't exist). Intent unclear; may have been in-progress refactor. Skip.
- `authorizer.ts` — start material for v0.3.

Associated source doc: `namespace-why.md` in the Console One docs, which describes the intended full architecture this roadmap points toward.
