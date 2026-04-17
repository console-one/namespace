import { Arguments } from '../vendor/arguments/index.js'
import { JSONPathWalker } from '@console-one/walker'
import type { ClassifierBuilder } from '@console-one/assessable'
import { Metric } from './metric.js'

export const Ingestor = <T>(
  metric: Metric,
  classifierBuilder: ClassifierBuilder,
  sinkAcceptor: (item: [args: Arguments, item: T, ...extraArgs: any[]]) => any): ClassifierBuilder => {
  let schema = metric.filter !== undefined ? [metric.filter] : []
  return classifierBuilder.addClassificationRequirement(
    metric.name, schema, (unsubscribe) => (next, mappers, ...args) => {

      let partitionWalker = new JSONPathWalker();
      let promises: any[] = new Array(metric.partitionKeys.length);
      let resolvers: any[] = new Array(metric.partitionKeys.length);

      for (let index = 0; index < metric.partitionKeys.length; index++) {
        let pathToSearch;
        if (mappers !== undefined && mappers[metric.partitionKeys[index]] !== undefined) {
          pathToSearch = mappers[metric.partitionKeys[index]]
        } else {
          pathToSearch = '@' + metric.partitionKeys[index];
        }
        promises[index] = new Promise((resolve, reject) => resolvers[index] = [resolve, reject]);
        partitionWalker.addHandler(pathToSearch, {
          success: (value: any) => {
            return resolvers[index][0](value[pathToSearch.split('.').slice(-1)[0]])
          },
          error: (err?) => resolvers[index][1](err),
          complete: () => resolvers[index][1]()
        });
      }

      partitionWalker.walk(next);

      return Promise.all(promises).then(async (values) => {
        let params: any = [];
        for (let index = 0; index < metric.partitionKeys.length; index++) {
          let pathToSearch;
          if (mappers !== undefined && mappers[metric.partitionKeys[index]] !== undefined) {
            pathToSearch = mappers[metric.partitionKeys[index]]
          } else {
            pathToSearch = '@' + metric.partitionKeys[index];
          }
          params.push({ key: pathToSearch, value: values[index] })
        }
        await sinkAcceptor([new Arguments(params), next, ...args])
      }).catch(err => {
        console.error('Error in classifier for parititons: ' + metric.name + '!');
        throw err;
      })

    });
}


