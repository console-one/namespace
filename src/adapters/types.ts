import { Table } from '../vendor/table.js'

/**
 * Storage-adapter primitives.
 *
 * The indexing engine (Monitor, Ingestor, Index) operates against these —
 * never against Redis or any specific vendor. Back them with Redis hashes +
 * sorted sets, Postgres tables, SQLite, in-memory (reference impls ship in
 * `adapters/memory.ts`).
 */

/**
 * A partition map: key/value store addressed by a multi-part column key.
 * In the original source this was `Generics.Awaited.PartitionMap<V>`.
 */
export interface PartitionMap<V> {
  set(key: Table.Columns.Default, value: V): Promise<void>
  get(key: Table.Columns.Default): Promise<V | undefined>
  getAll(keys: Table.Columns.Default[]): Promise<Array<[Table.Columns.Default, V]>>
  has(key: Table.Columns.Default): Promise<boolean>
  delete(key: Table.Columns.Default): Promise<void>
}

/**
 * A sorted set of values keyed by column key, with range-query support.
 * Critical for TimelineKey range queries — "all snapshots of source:main.js
 * where seq > 1000" becomes a single range read. In the original source this
 * was `Generics.Awaited.SortedSet<V>`.
 */
export interface SortedSet<V> {
  add(key: Table.Columns.Default, value: V): Promise<void>
  remove(key: Table.Columns.Default, value: V): Promise<void>
  findMax(key: Table.Columns.Default): Promise<V | undefined>
  /**
   * Stream values in range, batched. `bounds` carries start/end (numeric score
   * thresholds) and `options.batchSize` controls pagination chunk size.
   * Yields arrays of length ≤ batchSize.
   */
  read(
    key: Table.Columns.Default,
    bounds: { start?: number; end?: number },
    options?: { batchSize?: number }
  ): AsyncGenerator<V[], void, unknown>
}
