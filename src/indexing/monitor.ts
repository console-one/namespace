import type { Arguments } from '../vendor/arguments/index.js'
import type { PartitionMap, SortedSet } from '../adapters/types.js'
import { ListMultimap } from '@console-one/multimap'
import { PartitionTable, Table } from '../vendor/table.js'
import { select, underride } from '../vendor/utils.js'
import { Subscription } from '@console-one/subscription'
import { Metric } from './metric.js'
import { TimelineKey } from './timeline-key.js'

export type MetricRef = Table.Columns.Default | string
export type PartitionRef = Table.Columns.Default | string
export type Partition = Table.Columns.Default
export type MetricPartition = Table.Columns.Default
export type IndexMetricPartition = Table.Columns.Default
export type IndexMetricPartitionEvent = Table.Columns.Default
export type EventTrigger = Table.Columns.Default
export type TimelineName = string

const toMetricPartition = (metric: Metric, partition: Partition) => {

  return Table.from(metric.name, partition.toString(':'));
}
const toIndexMetricPartition = (index: TimelineName, metric: Metric, partition: Partition) => {
  // console.log("Timeline name: ", index, "Metric: ", metric.name, "Partition: ", partition)
  return Table.from(index, ...toMetricPartition(metric, partition).components);
}

enum InternalEvent {
  ADD = 'ADD', 
  REMOVE = 'REMVOE'
}

const toIndexMetricPartitionEvent = (index: TimelineName, metric: Metric, partition: Partition, internal: Monitor.Event) => {
  // console.log("Timeline name: ", index, "Metric: ", metric.name, "Partition: ", partition)
  return Table.from(index, ...toMetricPartition(metric, partition).components, internal);
}

const toEventTrigger = (index: TimelineName, metric: Metric, partition: Partition, internal: InternalEvent, state: string) => {
  // console.log("Timeline name: ", index, "Metric: ", metric.name, "Partition: ", partition)
  return Table.from(index, ...toMetricPartition(metric, partition).components.concat([internal.toString(), state]));
}

const safestring = (key: TimelineKey | undefined) => {
  if (key === undefined) return 'undefined';
  if (key === null) return 'null';
  return key.toString();
}

const defaultBounds = () => ({ start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY })
const withKey = (key: any, val: any) => <T>(mmap): T => {
  mmap.set(key, val); return mmap;
}

const defaultFallbackChain =  (): ListMultimap<Metric.Key, TimelineName> => {
  let multimap: any = withKey('*', 'LIVE')(new ListMultimap<Metric.Key, TimelineName>());
  multimap.set('prompt', 'NONE');
  return multimap;
}

export class Monitor {

  metricsByName: { [key: string]: Metric }
  metricsByColumns: Table<Metric>
  events: Map<IndexMetricPartitionEvent, Subscription<any>>

  constructor(
    public name: TimelineName,
    metrics: Metric[],
    public sset: SortedSet<TimelineKey>,
    public last: PartitionMap<TimelineKey>,
    public listeners: PartitionMap<any>,
    public fallbacks: ListMultimap<Metric.Key, TimelineName> = defaultFallbackChain(),
    public subscriptions: Map<MetricPartition, Subscription<TimelineKey>> = new Map<MetricPartition, Subscription<TimelineKey>>()
  ) {
    this.metricsByName = {};
    this.metricsByColumns = new PartitionTable<Metric>();
    for (let metric of metrics) {
      this.metricsByName[metric.name] = metric;
      this.metricsByColumns.set(Table.from(...metric.partitionKeys), metric);
    }
    this.events = new Map<IndexMetricPartitionEvent, Subscription<any>>();
    // let columns = this.listeners.getAll([Table.from('*')]);
    // for (let col of columns) {
    //   let tableColumns = Table.from(...col[0].components.slice(-5).slice(0, -1));
    //   this.subscriptions
    // }
  }

  private async _add(column: Table.Columns.Default, next: TimelineKey) {
    try {
      await this.sset.add(column, next);
      return await this.last.set(column, next);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  private async _remove(column: Table.Columns.Default, next: TimelineKey) {
    try {
      await this.sset.add(column, TimelineKey.DeleteKey());
      await this.last.delete(column);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  _on(metricRef: MetricRef, partitionRef: PartitionRef, method:  InternalEvent, state: any) {
    let trigger = toEventTrigger(this.name, this.getMetric(metricRef), this.getPartition(partitionRef), method, state);
    if (this.events.has(trigger)) this.events.get(trigger)?.resolve(state);
  }

  async add(metricRef: MetricRef, partitionRef: PartitionRef, next: TimelineKey, current?: TimelineKey): Promise<void> {
    // console.log("METRIC REF: ", metricRef, " PARTITTION REF: ", partitionRef, "NEXT", next);
    let metric = this.getMetric(metricRef);
    let partition = this.getPartition(partitionRef);
    let column = toIndexMetricPartition(this.name, metric, partition);
    await this._add(column, next);
    this._on(metricRef, partitionRef, InternalEvent['ADD'], next.toString());
  }

  async addSafe(metricRef: MetricRef, partitionRef: PartitionRef, next: TimelineKey, current?: TimelineKey): Promise<void> {
    let column = toIndexMetricPartition(this.name, this.getMetric(metricRef), this.getPartition(partitionRef));
    let tlKey = await this.last.get(column);
    if (safestring(tlKey) !== safestring(current)) {
      let errormessage = `Optimistic locking error updating index: ${this.name}.`
      errormessage += `Assumed previous version of ${safestring(current)} does not equal assumed: ${safestring(tlKey)}`;
      throw new Error(errormessage);
    }
    let result = await this._add(column, next);
    this._on(metricRef, partitionRef, InternalEvent['ADD'], next);
  }

  async connect(metricRef: MetricRef, partitionRef: PartitionRef, externalEvent: Monitor.Event, state?: string) {
    let external = toIndexMetricPartitionEvent(this.name, this.getMetric(metricRef), this.getPartition(partitionRef), Monitor.Event['NEXT'])
    return this.subscriptions.get(external)
  }
  
  async next(metricRef: MetricRef, partitionRef: PartitionRef) {
    let column = toIndexMetricPartition(this.name, this.getMetric(metricRef), this.getPartition(partitionRef));
    let external = toIndexMetricPartitionEvent(this.name, this.getMetric(metricRef), this.getPartition(partitionRef), Monitor.Event['NEXT']);
    let last = await this.last.get(column);
    if (this.subscriptions.has(external) && this.subscriptions.get(external)?.check === last) {
      return this.connect(metricRef, partitionRef, Monitor.Event['NEXT'], last.toString());
    }
    let internal = toEventTrigger(this.name, this.getMetric(metricRef), this.getPartition(partitionRef), InternalEvent['ADD'], last.toString());
    let internalListeners = await this.listeners.get(internal);
    let setInternal;
    if (internalListeners === null || internalListeners === undefined) {
      internalListeners = "NEXT";
      setInternal = internalListeners;
    } else if (internalListeners.indexOf("NEXT") < 0){
      internalListeners + ',' + "NEXT"
      setInternal = internalListeners;
      await this.listeners.set(internal, setInternal); 
    }
    let subscription = new Subscription<TimelineKey>(internal.toString());
    subscription.check = last;
    this.subscriptions.set(external, subscription.first((data) => data));
    subscription.cleanup.push(async () => {
      let listeners = (setInternal === undefined) ? await this.listeners.get(internal) : setInternal;
      let totalListeners = listeners.split(',');
      if (totalListeners.length < 2) this.listeners.delete(internal)
      else await this.listeners.set(internal, totalListeners.filter(listener => listener !== 'NEXT').join(','))
    });
    if (!this.events.has(internal)) this.events.set(internal, new Subscription(internal.toString()));
    this.events.get(internal).pipe(subscription);
    return this.connect(metricRef, partitionRef,  Monitor.Event['NEXT'], last.toString());
  }

  async remove(metricRef: MetricRef, partitionRef: PartitionRef, current: TimelineKey) {
    let column = toIndexMetricPartition(this.name, this.getMetric(metricRef), this.getPartition(partitionRef));
    let tlKey = await this.last.get(column);
    if (safestring(tlKey) !== safestring(current)) throw new Error(`Optimistic locking error updating index: ${this.name}`);
    return this._remove(column, tlKey);
  }

  async * readKeys(metricRef: MetricRef, partitionRef: PartitionRef,
    options: { start?: number, end?: number, batchSize?: number }): AsyncGenerator<TimelineKey[]> {
    let column = toIndexMetricPartition(this.name, this.getMetric(metricRef), this.getPartition(partitionRef));
    let bounds = underride(options === undefined ? {} : options, defaultBounds());
    let generator = this.sset.read(column, bounds, select('batchSize')(options));
    let columnGenerator: AsyncGenerator<TimelineKey[]> = generator;
    for await (let item of columnGenerator) yield item
  }

  async * partitions(): AsyncGenerator<[Table.Columns.Default, TimelineKey]> {
    return await this.last.getAll([Table.from(this.name, '*', '*')]);
  }

  async has(metricRef: MetricRef, partitionRef: PartitionRef) {
    let column = toIndexMetricPartition(this.name, this.getMetric(metricRef), this.getPartition(partitionRef));
    return this.last.has(column);
  }

  async canRetrieve(metricRef: MetricRef, partitionRef: PartitionRef) {
    let metric = this.getMetric(metricRef);
    let partition = this.getPartition(partitionRef);

    let name = this.name;
    let fallbacks = this.fallbacks.get(metric.key());
    let fallbackIndex = 0, resolved = 0, inspected = fallbacks.length;

    let column = toIndexMetricPartition(name, metric, partition);
    let can = await this.last.has(column);


    //     this.last.has(column).then(hasValue => {
    //       console.log("RESULT: ", hasValue);
    //       while (fallbackIndex < inspected) {
    //         if (hasValue){
    //           found = true;
    //           resolve(true);
    //           break;
    //         }
    //          resolved += 1;
    //         if (resolved === inspected) resolve(false);
    //         fallbackIndex += 1;
    //       }
    //       if (!found) resolve(false);
    //     });
    // });

    // console.log("Ca RETRIEVE VALUE IS: ", can);

    return can;
  }

  async state(metricRef: MetricRef, partitionRef: PartitionRef) {
    let column = toIndexMetricPartition(this.name, this.getMetric(metricRef), this.getPartition(partitionRef));
    let hasLast = await this.last.has(column);
    if (hasLast) return this.last.get(column);
    else throw new Error(`Last for column: ${column} not found!`)
  }

  async retrieve(metricRef: MetricRef, partitionRef: PartitionRef) {
    let metric = this.getMetric(metricRef);
    let partition = this.getPartition(partitionRef);
    let name = this.name;
    let fallbacks = this.fallbacks.get(metric.key());
    let column, found = false, fallbackIndex = -1;
    while (fallbackIndex < fallbacks.length) {
      column = toIndexMetricPartition(name, metric, partition);
      found = await this.last.has(column);
      if (found || fallbackIndex >= fallbacks.length) break;
      fallbackIndex += 1;
      name = fallbacks[fallbackIndex];
    }
    if (found) {
      let value = await this.last.get(column);
      if (fallbackIndex > -1) await this.add(metricRef, partitionRef, null, value);
      return value;
    }
    throw new Error(`Last for column: ${column} not found!`);
  }

  private getMetric(metricRef: MetricRef): Metric {
    let metric;
    if (typeof metricRef === 'string') metric = this.metricsByName[metricRef];
    else metric = this.metricsByColumns.get(metricRef);
    if (metric === undefined) throw new Error(`Cannot find metric! ${metricRef}`)
    return metric;
  }

  private getPartition(partitionRef: PartitionRef): Partition {
    let partition;

    // console.log("Partition REF IS: ", partitionRef)
    if (typeof partitionRef === 'string') partition = Table.from(...partitionRef.split(':'))
    else partition = partitionRef;
    return partition;
  }

}

export namespace Monitor {
  export enum Event {
    NAME = 'NAME',
    ADD = 'ADD',
    REMOVE = 'REMOVE'
  }
}




