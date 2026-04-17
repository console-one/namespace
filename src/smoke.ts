/**
 * Smoke test: dual-mode Path addressing, TimelineKey ordering, Monitor range
 * queries through in-memory adapters.
 *
 * Exits non-zero on any assertion failure.
 */

import {
  InMemoryPartitionMap,
  InMemorySortedSet,
  Metric,
  Monitor,
  Path,
  PathReference,
  PathType,
  Table,
  TimelineKey
} from './index.js'

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`[smoke] assertion failed: ${msg}`)
}

// ---------------------------------------------------------------------------
// Case 1: Path parses both addressing modes (version vs. stage)
// ---------------------------------------------------------------------------
function caseDualAddressing() {
  const versioned = Path.fromString('src/main.ts/1234567890')
  assert(versioned.type === 'VERSION', `expected VERSION, got ${versioned.type}`)
  assert(versioned.version === 1234567890, `expected version 1234567890, got ${versioned.version}`)
  assert(versioned.namespace === 'src/main.ts', `namespace mismatch: ${versioned.namespace}`)

  const staged = Path.fromString('src/main.ts/LIVE')
  assert(staged.type === 'STAGE', `expected STAGE, got ${staged.type}`)
  assert(staged.stage === 'LIVE', `stage mismatch: ${staged.stage}`)
  assert(staged.isLive() === true, 'LIVE should isLive()')

  console.log('[smoke] case1 OK — Path parses both version (1234567890) and stage (LIVE) modes')
}

// ---------------------------------------------------------------------------
// Case 2: Path round-trips through toString with URL params
// ---------------------------------------------------------------------------
function casePathRoundtrip() {
  const original = 'src/app.ts/1234?encoding=ts&env=prod'
  const p = Path.fromString(original)
  const serialized = p.toString()
  // The source's Arguments serialization is order-sensitive; assert just that
  // the key pieces survive a roundtrip.
  assert(serialized.includes('src/app.ts'), `missing namespace in '${serialized}'`)
  assert(serialized.includes('1234'), `missing version in '${serialized}'`)
  assert(serialized.includes('encoding=ts'), `missing encoding param in '${serialized}'`)
  console.log(`[smoke] case2 OK — Path roundtrip preserves namespace, version, and params`)
}

// ---------------------------------------------------------------------------
// Case 3: PathReference resolves relative + absolute + library references
// ---------------------------------------------------------------------------
function casePathReference() {
  const abs = new PathReference('/workspace/src/app.ts/LIVE')
  assert(abs.pathType === PathType.ABSOLUTE, `expected ABSOLUTE, got ${abs.pathType}`)

  const rel = new PathReference('./helpers/util.ts/LIVE')
  assert(rel.pathType === PathType.RELATIVE, `expected RELATIVE, got ${rel.pathType}`)

  const lib = new PathReference('lodash')
  assert(lib.pathType === PathType.LIBRARY, `expected LIBRARY, got ${lib.pathType}`)

  const storage = new PathReference('@:workspace:config')
  assert(storage.pathType === PathType.STORAGE, `expected STORAGE, got ${storage.pathType}`)

  console.log('[smoke] case3 OK — PathReference distinguishes absolute, relative, library, storage')
}

// ---------------------------------------------------------------------------
// Case 4: TimelineKey round-trips type:key:seq and orders by seq
// ---------------------------------------------------------------------------
function caseTimelineKey() {
  const tk = new TimelineKey('source', 1000, 'main.ts')
  assert(tk.toString() === 'source:main.ts:1000', `expected 'source:main.ts:1000', got '${tk.toString()}'`)

  const noKey = new TimelineKey('deployment', 500)
  assert(noKey.toString() === 'deployment:500', `expected 'deployment:500', got '${noKey.toString()}'`)

  const roundtrip = TimelineKey.fromJSON(tk.toJSON())
  assert(roundtrip.type === tk.type && roundtrip.seq === tk.seq && roundtrip.key === tk.key, 'JSON roundtrip mismatch')

  console.log('[smoke] case4 OK — TimelineKey round-trips through string and JSON')
}

// ---------------------------------------------------------------------------
// Case 5: Monitor indexes TimelineKeys and returns them via range query
// ---------------------------------------------------------------------------
async function caseMonitorRangeQuery() {
  // Declare a Metric that partitions by (workspace, artifact).
  const byArtifact = Metric.builder()
    .partitionBy('workspace', 'artifact')
    .as('workspace-artifact')
    .build()

  const sset = new InMemorySortedSet<TimelineKey>(tlk => tlk.seq)
  const last = new InMemoryPartitionMap<TimelineKey>()
  const listeners = new InMemoryPartitionMap<any>()

  const monitor = new Monitor('test-monitor', [byArtifact], sset, last, listeners)

  // Add three timelinekey snapshots at different seqs, same partition.
  const partition = Table.from('main', 'file.ts')
  await monitor.add('workspace-artifact', partition, new TimelineKey('source', 100, 'file.ts'))
  await monitor.add('workspace-artifact', partition, new TimelineKey('source', 200, 'file.ts'))
  await monitor.add('workspace-artifact', partition, new TimelineKey('source', 300, 'file.ts'))

  // Range query: seqs 150..250 should return only the seq=200 key.
  const collected: TimelineKey[] = []
  for await (const batch of monitor.readKeys('workspace-artifact', partition, { start: 150, end: 250 })) {
    for (const tlk of batch) collected.push(tlk)
  }
  assert(collected.length === 1, `expected 1 key in range [150, 250], got ${collected.length}`)
  assert(collected[0].seq === 200, `expected seq=200, got seq=${collected[0].seq}`)

  // .state() returns the most recent tlkey (seq=300) via the PartitionMap.
  const latest = await monitor.state('workspace-artifact', partition)
  assert(latest !== undefined && latest.seq === 300, `expected latest seq=300, got ${latest?.seq}`)

  console.log(`[smoke] case5 OK — Monitor range-queries TimelineKeys (in [150,250] → 1 key; last → seq=300)`)
}

async function main() {
  console.log('[smoke] @console-one/namespace')
  caseDualAddressing()
  casePathRoundtrip()
  casePathReference()
  caseTimelineKey()
  await caseMonitorRangeQuery()
  console.log('[smoke] ALL OK')
}

main().catch(err => {
  console.error('[smoke] FAIL', err)
  process.exit(1)
})
