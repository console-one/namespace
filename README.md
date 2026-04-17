# @console-one/namespace

Multi-dimensional, temporal artifact index. Address any artifact across **identity** (namespace), **time** (version), and **context** (stage) in one path. Declare indexes as `Metric` objects — no schema migrations. Range-query artifact snapshots by sequence. Back it with any key/value + sorted-set storage (Redis, Postgres, SQLite, in-memory).

## What's interesting about it

**Dual addressing modes in one path.** `src/main.ts/1234567890` addresses a specific version; `src/main.ts/LIVE` addresses "whatever is current in the LIVE stage". Same `Path` type, same parser. Code references use version mode for reproducibility; deployment pipelines use stage mode for "latest available."

**Metric-declared indexes, not schemas.** To index by (workspace, artifact), declare it:

```ts
Metric.builder()
  .partitionBy('workspace', 'artifact')
  .as('workspace-artifact')
  .build()
```

Adding a new index is declaring a new Metric — no migrations, no schema change. The `Ingestor` walks incoming objects on write, extracts partition keys via the declared paths, and updates the relevant sorted sets synchronously.

**TimelineKey as universal identifier.** Every indexed snapshot gets a `type:key:seq` triple — artifact category, semantic name, monotonic sequence number. Because `seq` is numeric and monotonic, range queries are a single sorted-set read: *"all snapshots of `source:main.js` with seq between 1000 and 2000"*.

**Synchronous write path, no separate indexing pass.** The Ingestor updates indexes during the write. Reads immediately see correct state — the build pipeline asking "latest version?" right after a save gets the just-saved version, not a stale one.

**Fallback chains for gradual rollouts.** `Monitor.retrieve()` walks a per-metric fallback list when the primary partition isn't found — letting a lookup degrade gracefully from `LIVE` → `INTEG` → `STAGING` rather than 404.

**Storage-vendor neutral.** The indexing engine operates against two adapter interfaces (`PartitionMap`, `SortedSet`) and a `ColumnKey` primitive. Back them with Redis (hashes + sorted sets), Postgres (tables + indexes), SQLite, DynamoDB, or in-memory.

## Install

```bash
npm install @console-one/namespace
```

## Quick start

```ts
import {
  InMemoryPartitionMap,
  InMemorySortedSet,
  Metric,
  Monitor,
  Path,
  Table,
  TimelineKey
} from '@console-one/namespace'

// 1. Declare a metric that partitions by (workspace, artifact).
const byArtifact = Metric.builder()
  .partitionBy('workspace', 'artifact')
  .as('workspace-artifact')
  .build()

// 2. Build storage adapters — swap for Redis/Postgres/etc. in production.
const sset = new InMemorySortedSet<TimelineKey>(tlk => tlk.seq)
const last = new InMemoryPartitionMap<TimelineKey>()
const listeners = new InMemoryPartitionMap<any>()

// 3. Construct the Monitor.
const monitor = new Monitor('my-index', [byArtifact], sset, last, listeners)

// 4. Index some snapshots.
const partition = Table.from('main', 'file.ts')
await monitor.add('workspace-artifact', partition, new TimelineKey('source', 100, 'file.ts'))
await monitor.add('workspace-artifact', partition, new TimelineKey('source', 200, 'file.ts'))
await monitor.add('workspace-artifact', partition, new TimelineKey('source', 300, 'file.ts'))

// 5. Range-query a sequence window.
for await (const batch of monitor.readKeys('workspace-artifact', partition, { start: 150, end: 250 })) {
  for (const tlk of batch) console.log(tlk.toString())  // 'source:file.ts:200'
}

// 6. Address artifacts by version or stage.
const versioned = Path.fromString('src/main.ts/1234567890')  // type='VERSION'
const staged = Path.fromString('src/main.ts/LIVE')           // type='STAGE'
```

## Public surface

**Addressing primitives**
- `Path`, `PathType`, `PathReference` — URL-style namespace addressing with version/stage mode and parameters
- `Version` — strict Path variant with location tracking (`[mode, occurrence]` tuples) for pinpointing constructs within a file

**Indexing engine**
- `TimelineKey` — immutable `type:key:seq` identifier
- `Metric` — declarative partition specification (`Metric.builder().partitionBy(...).where(...).as(...).build()`)
- `Monitor` — central indexer (add / remove / state / retrieve / readKeys / partitions / has / canRetrieve)
- `Ingestor` — walks incoming objects with declared partition paths; plugs into a `ClassifierBuilder` from `@console-one/assessable`

**Argument model** (used by Path params + Ingestor)
- `Arguments`, `Argument`, `Param`, `Declaration`

**Column-key primitives**
- `Table`, `PartitionTable` — `Table.Columns.Default` is the multi-part key used throughout

**Storage adapters**
- `PartitionMap<V>`, `SortedSet<V>` — the two interfaces the engine operates against
- `InMemoryPartitionMap`, `InMemorySortedSet` — reference implementations for tests and as templates

## Layout

```
src/
├── index.ts                    # Public surface
├── smoke.ts                    # End-to-end smoke test
│
├── path.ts                     # Path, PathType, PathReference
├── version.ts                  # Version (strict Path variant)
│
├── indexing/
│   ├── timeline-key.ts         # type:key:seq identifier
│   ├── metric.ts               # Declarative partition specification
│   ├── monitor.ts              # Range-queryable indexer
│   └── ingestor.ts             # Classifier-driven index updater
│
├── adapters/
│   ├── types.ts                # PartitionMap, SortedSet interfaces
│   └── memory.ts               # In-memory reference impls
│
└── vendor/
    ├── arguments/              # URL-arg model (Arguments, Argument, Param, Declaration)
    ├── table.ts                # Table.Columns.Default + PartitionTable
    └── utils.ts                # Small object helpers
```

## Storage backends

The engine is backed by:

- **`PartitionMap<V>`** — key/value addressed by `Table.Columns.Default`. Redis hash, Postgres row, SQLite table, in-memory Map.
- **`SortedSet<V>`** — sorted collection with numeric score, supports range-read as async generator. Redis sorted set (ZADD/ZRANGEBYSCORE), Postgres table + index on (key, score), in-memory sorted array.

See `adapters/memory.ts` for reference implementations (~100 lines total). Production implementations against Redis or Postgres are straightforward: each interface has 4–5 async methods.

## Smoke test

```bash
npm install
npm run build
npm run smoke
```

Asserts five end-to-end paths:

1. Path parses both version (`/1234567890`) and stage (`/LIVE`) modes.
2. Path round-trips `namespace/index?params` through toString.
3. PathReference distinguishes absolute, relative, library, and storage references.
4. TimelineKey round-trips through string (`type:key:seq`) and JSON.
5. Monitor indexes TimelineKeys through in-memory adapters, range-queries by seq window, and returns the latest via `.state()`.

## Known limitations

- **`timelines.ts`** from the source monorepo imports a `./partition` module that doesn't exist and references `ioredis` directly; it didn't compile in the source at extraction time. Dropped. If you need anything it was attempting, use `Monitor` directly.
- **`Monitor.next()`** returns a subscription for change notifications; the wiring is complex and not covered by the current smoke. Use `.state()` for simple latest-value reads and `.readKeys()` for range queries.
- **`Monitor.canRetrieve()`** only checks the primary partition; the fallback chain walk it's supposed to perform is commented out in the source. Use `.retrieve()` for the fallback-aware path.

## Extending beyond v0.1

See [`ROADMAP.md`](./ROADMAP.md) for the path to a full `Index` coordinator (wrapping Monitor + a blob Storage layer) with typed artifact serialization, optimistic locking over save, hierarchical-permission `Authorizer`, and change subscriptions.

## License

MIT
