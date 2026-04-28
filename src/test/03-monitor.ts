// ─────────────────────────────────────────────────────────────────────────
// Monitor.add → readKeys (range) and Monitor.state (latest), via the
// in-memory PartitionMap + SortedSet adapters and a Metric partition spec.
// ─────────────────────────────────────────────────────────────────────────

import {
  InMemoryPartitionMap,
  InMemorySortedSet,
  Metric,
  Monitor,
  Table,
  TimelineKey,
} from '../index.js';

function buildMonitor() {
  const metric = Metric.builder()
    .partitionBy('workspace', 'artifact')
    .as('workspace-artifact')
    .build();
  const sset = new InMemorySortedSet<TimelineKey>((tlk) => tlk.seq);
  const last = new InMemoryPartitionMap<TimelineKey>();
  const listeners = new InMemoryPartitionMap<any>();
  return new Monitor('test-monitor', [metric], sset, last, listeners);
}

export default async (test: (name: string, body: (validator: any) => any) => any) => {
  await test('readKeys [start, end] returns only keys with seqs in that range', async (validator: any) => {
    const monitor = buildMonitor();
    const partition = Table.from('main', 'file.ts');
    await monitor.add('workspace-artifact', partition, new TimelineKey('source', 100, 'file.ts'));
    await monitor.add('workspace-artifact', partition, new TimelineKey('source', 200, 'file.ts'));
    await monitor.add('workspace-artifact', partition, new TimelineKey('source', 300, 'file.ts'));
    const collected: TimelineKey[] = [];
    for await (const batch of monitor.readKeys('workspace-artifact', partition, { start: 150, end: 250 })) {
      for (const tlk of batch) collected.push(tlk);
    }
    return validator.expect({
      count: collected.length,
      seq: collected[0]?.seq,
    }).toLookLike({ count: 1, seq: 200 });
  });

  await test('Monitor.state returns the most-recent (highest-seq) TimelineKey', async (validator: any) => {
    const monitor = buildMonitor();
    const partition = Table.from('main', 'file.ts');
    await monitor.add('workspace-artifact', partition, new TimelineKey('source', 100, 'file.ts'));
    await monitor.add('workspace-artifact', partition, new TimelineKey('source', 200, 'file.ts'));
    await monitor.add('workspace-artifact', partition, new TimelineKey('source', 300, 'file.ts'));
    const latest = await monitor.state('workspace-artifact', partition);
    return validator.expect(latest?.seq).toLookLike(300);
  });

  await test('Monitor.state throws for an unknown partition', async (validator: any) => {
    const monitor = buildMonitor();
    const partition = Table.from('empty', 'no-such-file');
    let threw = false;
    try {
      await monitor.state('workspace-artifact', partition);
    } catch {
      threw = true;
    }
    return validator.expect(threw).toLookLike(true);
  });
};
