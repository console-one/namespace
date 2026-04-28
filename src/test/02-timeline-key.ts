// ─────────────────────────────────────────────────────────────────────────
// TimelineKey: type:key:seq textual form, JSON round-trip.
// ─────────────────────────────────────────────────────────────────────────

import { TimelineKey } from '../index.js';

export default async (test: (name: string, body: (validator: any) => any) => any) => {
  await test('TimelineKey toString includes type, key, and seq', async (validator: any) => {
    const tk = new TimelineKey('source', 1000, 'main.ts');
    return validator.expect(tk.toString()).toLookLike('source:main.ts:1000');
  });

  await test('TimelineKey without a key still serializes type:seq', async (validator: any) => {
    const noKey = new TimelineKey('deployment', 500);
    return validator.expect(noKey.toString()).toLookLike('deployment:500');
  });

  await test('TimelineKey JSON round-trip preserves type, key, seq', async (validator: any) => {
    const tk = new TimelineKey('source', 1000, 'main.ts');
    const r = TimelineKey.fromJSON(tk.toJSON());
    return validator.expect({
      type: r.type, seq: r.seq, key: r.key,
    }).toLookLike({ type: 'source', seq: 1000, key: 'main.ts' });
  });
};
