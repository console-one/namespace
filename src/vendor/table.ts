export namespace Table {
  
  export namespace Columns {

    export interface Columns<K> {
      delimeter: string
      components: K[]
      extend(...keys: K[]) : Columns<K>
      stack(...keys: K[]) : Columns<K>
      keys() : K[]
      hasPartition() : boolean
      partition() : Columns<K>
      terminalKey() : string
      toString() : string
    }

    export class Default implements Columns<string> {
      constructor(
        readonly delimeter: string = Default.DELIMETER,
        readonly components: string[] = []) {
      }


      stack(...keys: string[] | [Table.Columns.Default]): Columns<string> {
        if (keys.length < 1) {
          throw new Error(`At least one item, either a key or string needs to be provided ` +
            `to extend a column. None was provided when extending ${this}`);
        }
        if (typeof keys[0] === 'string') {
          return new Default(this.delimeter, (keys as string[]).concat(this.components));
        } else if (typeof keys[0] === 'object') {
          if (keys.length > 1) {
            throw new Error(`If a column argument is provided to the Columns.Default.extend() method ` +
              `no other arguents can be provided. A column argument and additional arguments were ` +
              `provided, when calling extend() on Columns.Default ${this.toString()} with arguments ${keys}`);
          }
          let addedComponents = (keys[0] as Table.Columns.Default).components;
          return new Default(this.delimeter, addedComponents.concat(this.components));
        } else {
          throw new Error(`Invalid argument type for argument 0 of Columns.Default.extend(). ` +
            `Only string or Table.Columns.Default arguments are accepted. Argument value was ${keys[0]}`);
        }
      }

      extend(...keys: string[] | [Table.Columns.Default]): Columns<string> {
        if (keys.length < 1) {
          throw new Error(`At least one item, either a key or string needs to be provided ` +
            `to extend a column. None was provided when extending ${this}`);
        }
        if (typeof keys[0] === 'string') {
          return new Default(this.delimeter, this.components.concat(keys as string[]));
        } else if (typeof keys[0] === 'object') {
          if (keys.length > 1) {
            throw new Error(`If a column argument is provided to the Columns.Default.extend() method ` +
              `no other arguents can be provided. A column argument and additional arguments were ` + 
              `provided, when calling extend() on Columns.Default ${this.toString()} with arguments ${keys}`);
          }
          let addedComponents = (keys[0] as Table.Columns.Default).components;
          return new Default(this.delimeter, this.components.concat(addedComponents));
        } else {
          throw new Error(`Invalid argument type for argument 0 of Columns.Default.extend(). ` + 
            `Only string or Table.Columns.Default arguments are accepted. Argument value was ${keys[0]}`);
        }
      }

      hasPartition() {
        return this.components.length > 0;
      }

      partition() {
        return new Default(this.delimeter, this.components.slice(0, this.components.length - 1));
      }

      terminalKey() {
        return this.components[this.components.length - 1];
      }

      keys() : string[] {
        return this.components.map(i => i);
      }

      toString(delimeterOverride?: string) : string {
        if (delimeterOverride !== undefined) return this.components.join(delimeterOverride);
        return this.components.join(this.delimeter);
      }

      static DELIMETER: string = '||';

      static from(...cols: string[]) {
        return new Default.Builder().from(...cols);
      }

      static builder(delimeter: string = Default.DELIMETER) {
        return new Default.Builder(delimeter)
      }
    }

    export namespace Default {
      export class Builder {

        delimeter: string
        components: string[]

        constructor(delimeter: string = Default.DELIMETER) {
          this.delimeter = delimeter;
          this.components = [];
        }

        from(...cols: string[]) {
          return new Default(this.delimeter, cols);
        }

        add(col) {
          this.components.push(col);
        }

        clear() {
          this.delimeter = Default.DELIMETER;
          this.components = [];
        }

        build(delim?) {
          let delimeter = delim ||= this.delimeter;
          let components = this.components.map(i => i);
          return new Default(delimeter, components);
        }
      }
    }
  }


  export const from = (...args) => {
    return Table.Columns.Default.from(...args);
  }

  export const col = (arg: Table.Columns.Default | string) => {
    if (typeof arg === 'string') {
      return from(arg); 
    } else {
      return arg as Table.Columns.Default;
    }
  }

}


export interface Table<Value> extends Map<Table.Columns.Default, Value> {
}

export class PartitionTable<Value> extends Map<Table.Columns.Default, Value> {

  toJSON() {
    let jsonObj: any = {};
    for (let key of this.keys()) {
      let stringKey = key.toString();
      jsonObj[stringKey] = this.get(key);
    }
    return jsonObj;
  }

  static fromJSON = <Value>(json: any, delim: string = '||'): PartitionTable<Value> => {
    let table = new PartitionTable<Value>();
    for (let key of Object.keys(json)) {
      let col = Table.Columns.Default.from(...key.split(delim));
      table.set(col, json[key]);
    }
    return table;
  }

}

export interface PartitionedDatastore extends Table<any> {}





