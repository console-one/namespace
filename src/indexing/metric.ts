import { Table } from '../vendor/table.js';
import type { Requirements } from '@console-one/assessable';
import { Schema } from '@console-one/assessable';

const isRequirement = (obj) => {
  return typeof obj === 'object' && 
    !Array.isArray(obj) && 
    obj.hasOwnProperty('requirements') && 
    obj.hasOwnProperty('conditition')
}

export class Metric {

  indices: { [key: string]: number }
  partitionKeys: string[]
  filter?: Requirements

  constructor(
    public name: string,
    partitionKeys: string[],
    filter?: Requirements
  ) {
    this.partitionKeys = partitionKeys;
    this.filter = filter;
    let partitionIndices: { [key: string]: number } = {};
    for (let index = 0; index < this.partitionKeys.length; index++) {
      partitionIndices[this.partitionKeys[index]] = index;
    }
    this.indices = partitionIndices;
  }

  get schema(): Requirements {
    let requirements: any = [];
    if (this.filter !== undefined) requirements.push(this.filter);
    for (let partition of this.partitionKeys) {
      requirements.push(['@' + partition, 'EXISTS', ''])
    }
    return requirements
  }

  toJSON() {
    let json: any = {
      name: this.name,
      partitionKeys: this.partitionKeys
    }
    if (this.filter !== undefined) {
      json.filter = this.filter;
    }
    return json;
  }

  key(): Metric.Key {
    return Table.from(...this.partitionKeys);
  }

  static fromJSON(json: any) {
    return (json.hasOwnProperty('filter')) ? 
      new Metric(json.name, json.partitionKeys, json.filter) :  
      new Metric(json.name, json.partitionKeys);
  }

  static Builder = class Builder {

    partitionKeys: string[]
    filters: Requirements[]
    last?: Requirements 
    schemaPreds?: boolean
    name: string

    constructor() {
      this.partitionKeys = [];
      this.filters = [];
    }

    partitionBy(...partitionKeys: string[]) {
      if (this.last !== undefined) {
        this.filters.push(this.last);
        this.last = undefined;
      }
      this.partitionKeys = partitionKeys;
      return this;
    }

    where(schema: any) {
      this.schemaPreds = true;
      if (this.last !== undefined) {
        this.filters.push(this.last);
      }
      this.last = Schema(schema);
      return this;
    }

    iff(requirement) {
      this.schemaPreds = false;
      if (this.last !== undefined) {
        this.filters.push(this.last);
      }
      this.last = requirement;
      return this;
    }

    or(requirement: any) {
      if (this.last === undefined) {
        throw new Error(`cannot use or condition without an initial requiremnt`)
      } else {
        requirement = (this.schemaPreds) ? Schema(requirement) : requirement as Requirements;
        if (isRequirement(this.last)) {
          if (this.last.condition === 'OR') {
            if (!Array.isArray(requirement) && requirement.condition === 'OR') {
              this.last.requirements = this.last.requirements.concat(requirement.requirements);
            } else {
              this.last.requirements.push(requirement);
            }
          } else if (requirement.condition === 'OR') {
            requirement.requirements.push(this.last);
            this.last = requirement;
          } else {
            this.last = {
              requirements: [this.last, requirement],
              condition: 'OR'
            }
          }
        }
      }
      return this;
    }

    and(requirement: Requirements) {
      if (this.last === undefined) {
        throw new Error()
      } else {
        requirement = (this.schemaPreds) ? Schema(requirement) : requirement as Requirements;
        if (isRequirement(this.last)) {
          if (this.last.condition === 'AND') {
            if (!Array.isArray(requirement) && requirement.condition === 'AND') {
              this.last.requirements = this.last.requirements.concat(requirement.requirements);
            } else {
              this.last.requirements.push(requirement);
            }
          } else if (requirement.condition === 'AND') {
            requirement.requirements.push(this.last);
            this.last = requirement;
          } else {
            this.last = {
              requirements: [this.last, requirement],
              condition: 'AND'
            }
          }
        }
      }
      return this;
    }

    as(name: string) {
      this.name = name;
      return this;
    }

    build() {
      if (this.filters.length > 0) {
        return new Metric(this.name, this.partitionKeys, {
          requirements: this.filters,
          condition: 'AND'
        })
      } else {
        return new Metric(this.name, this.partitionKeys);
      }
    }
  }

  static builder = () => {
    return new Metric.Builder();
  }
}

export namespace Metric {
  export type Key = Table.Columns.Default
}