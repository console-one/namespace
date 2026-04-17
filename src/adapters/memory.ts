import { Table } from '../vendor/table.js'
import { PartitionMap, SortedSet } from './types.js'

/**
 * In-memory reference adapters.
 *
 * Used by the smoke test and as a template for implementing against real
 * storage. Not thread-safe and not persistent — back the interfaces with
 * Redis / Postgres / SQLite / whatever for production use.
 */

export class InMemoryPartitionMap<V> implements PartitionMap<V> {
  private store = new Map<string, V>()

  async set(key: Table.Columns.Default, value: V): Promise<void> {
    this.store.set(key.toString(), value)
  }

  async get(key: Table.Columns.Default): Promise<V | undefined> {
    return this.store.get(key.toString())
  }

  async getAll(keys: Table.Columns.Default[]): Promise<Array<[Table.Columns.Default, V]>> {
    const out: Array<[Table.Columns.Default, V]> = []
    for (const key of keys) {
      const v = this.store.get(key.toString())
      if (v !== undefined) out.push([key, v])
    }
    return out
  }

  async has(key: Table.Columns.Default): Promise<boolean> {
    return this.store.has(key.toString())
  }

  async delete(key: Table.Columns.Default): Promise<void> {
    this.store.delete(key.toString())
  }
}

/**
 * SortedSet backed by a Map<columnKey, Array<V>>. Values are ordered by the
 * `scoreOf` function passed to the constructor. For TimelineKey use
 * `(tlk) => tlk.seq`.
 */
export class InMemorySortedSet<V> implements SortedSet<V> {
  private buckets = new Map<string, V[]>()

  constructor(private scoreOf: (value: V) => number) {}

  async add(key: Table.Columns.Default, value: V): Promise<void> {
    const k = key.toString()
    const bucket = this.buckets.get(k) ?? []
    bucket.push(value)
    bucket.sort((a, b) => this.scoreOf(a) - this.scoreOf(b))
    this.buckets.set(k, bucket)
  }

  async remove(key: Table.Columns.Default, value: V): Promise<void> {
    const bucket = this.buckets.get(key.toString())
    if (!bucket) return
    const target = this.scoreOf(value)
    const idx = bucket.findIndex(v => this.scoreOf(v) === target)
    if (idx >= 0) bucket.splice(idx, 1)
  }

  async findMax(key: Table.Columns.Default): Promise<V | undefined> {
    const bucket = this.buckets.get(key.toString())
    if (!bucket || bucket.length === 0) return undefined
    return bucket[bucket.length - 1]
  }

  async * read(
    key: Table.Columns.Default,
    bounds: { start?: number; end?: number },
    options?: { batchSize?: number }
  ): AsyncGenerator<V[], void, unknown> {
    const bucket = this.buckets.get(key.toString()) ?? []
    const start = bounds.start ?? -Infinity
    const end = bounds.end ?? Infinity
    const batchSize = options?.batchSize ?? 100

    let batch: V[] = []
    for (const value of bucket) {
      const score = this.scoreOf(value)
      if (score < start) continue
      if (score > end) break
      batch.push(value)
      if (batch.length >= batchSize) {
        yield batch
        batch = []
      }
    }
    if (batch.length > 0) yield batch
  }
}
