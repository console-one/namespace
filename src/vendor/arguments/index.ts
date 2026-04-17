import { Argument } from './argument.js'
import { Declaration } from './declaration.js'
import { Param } from './param.js'
import * as obj from '../utils.js';

export type ArgumentMapping = {
  path: string,
  static?: string
  key?: string
} | {
  static: string,
  path?: string
  key?: string
}


export interface ArgumentMap<V> {
  indices: Declaration[]
  keys: { [key: string]: number }
  values: V[]
  implicit: { [key: string]: Argument }
}

const ACCESS_FAILURE = (key: string) => {
  throw new Error(`Trying to access API argument with key of ${key}, but no argument with that key is defined!`)
}

export type Indices = {
  key?: string,
  value?: any,
  type?: any,
  defaults?: any
}

export class FunctionArguments {

  indices: Declaration[]
  keys: Map<string, number>
  values: any[]
  implicit: Map<string, Argument>

  constructor(indices: Indices[]) {

    this.indices = new Array<Declaration>(indices.length);
    this.keys = new Map<string, number>();
    this.values = new Array(indices.length);
    this.implicit = new Map<string, Argument>();

    for (let i = 0; i < indices.length; i++) {

      let declarationJSON = obj.select('defaults', 'key', 'type')(indices[i]);
      this.indices[i] = Declaration.fromJSON(declarationJSON);
      this.values[i] = indices[i].hasOwnProperty('value') ? indices[i].value : indices[i].hasOwnProperty('defaults') ? indices[i].defaults : undefined;
      if (this.indices[i].key !== undefined) {
        this.keys.set(this.indices[i].key + '', i); 
      } 
    }
  }

  get length() {
    return this.indices.length
  }

  getIndices() {
    let indexes: Indices[] = [];
    for (let i = 0; i < this.indices.length; i++) {
      let jsonIndex: any = this.indices[i].toJSON();
      if (this.values[i] !== undefined) jsonIndex.value = this.values[i];
      indexes.push(jsonIndex);
    }
    return indexes;
  }

  set(key: string, value: any) {
    let valIndex = this.keys.get(key + '');
    this.values[valIndex] = value;
    return this;
  }

  setDeclaredValue(key: string | number, value: any) {
    let valIndex = this.keys.get(key + '');
    this.values[valIndex] = value;
    return this;
  }

  setImplicitValue(name: string, value: any) {
    if (this.keys.has(name)) {
      throw new Error(`Cannot set an implicit argument for a declared API function argument key.` +
        ` Key: ${name} value: ${value}`)
    }
    this.implicit.set(name, value);
    return this;
  }

  hasImplicitArgumentNamed(name: string): boolean {
    return this.implicit.has(name);
  }

  getImplicitArguments(): { [key: string]: Argument } {
    return obj.clone(obj.fromMap(this.implicit));
  }

  hasDeclarationNamed(key: string): boolean {
    return this.keys.has(key);
  }

  hasDeclaredValueNamed(key: string): boolean {
    return this.hasDeclarationNamed(key) && this.values[this.keys.get(key)] !== undefined;
  }

  getDeclaration(key: string): string {
    return this.implicit[this.keys.get(key)];
  }

  getDeclaredValueNamed(key: string): string {
    return this.values[this.keys.get(key)];
  }

  hasImplicitValueNamed(key: string): boolean {
    return this.implicit.has(key);
  }

  getImplicitValueNamed(key: string): any {
    return this.implicit.get(key);
  }

  hasDeclaredValueAtIndex(index: number): boolean {
    return this.values[index] !== undefined;
  }

  getDeclaredValueAtIndex(index: number): any {
    return this.values[index];
  }

  getDeclaredNameAtIndex(index: number): any {
    return this.indices[index].key;
  }

  getIndexOfDeclarationName(key: string): number {
    return this.keys.get(key);
  }

  get(key: string, defaultor: (key: string) => any = ACCESS_FAILURE): any {
    if (this.hasDeclarationNamed(key)) {
      return this.getDeclaredValueNamed(key);
    }
    if (this.hasImplicitValueNamed(key)) {
      return this.getImplicitValueNamed(key);
    }
    return defaultor(key);
  }

  getArguments() {
    let args = [];
    for (let i = 0; i < this.indices.length; i++) {

      
      let arg: any = obj.omit('value')({
        ...this.indices[i]
      });

      arg.value = this.indices[i];

      if (this.indices[i] !== null || this.indices[i] !== undefined) {
        arg.key = this.indices[i].key;
      }
      args.push(arg);
    }
    return args;
  }


  toObject(defaultValues) {
    let arr = new Array(this.indices.length);
    let readDeclarations = this.readDeclarations();
    for (let input of readDeclarations) {
      arr[input.index] = input.key;
    }

    let validatable = {};
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === null || arr[i] === undefined) {
        validatable[i] = this.implicit.get('')
      } else {
        validatable[arr[i]] = defaultValues.get(arr[i]);
      }
    }
    for (let entry of defaultValues.readImplicitArgumentValues()) {
      validatable[entry.key] = entry.value;
    }
  }

  * readDeclaredArgumentValues() {
    let copiedDeclarations = this.toParams();
    for (let i = 0; i < copiedDeclarations.length; i++) {
      yield {
        value: this.values[i],
        ...copiedDeclarations[i]
      }
    }
    return;
  }

  * readDefinedArgumentValues(): Generator<{ key: string, value: any, type?: any }> {
    let definedIndices = this.getDefinedKeys();
    for (let i = 0; i < definedIndices.length; i++) {
      let arg: any = {
        key: definedIndices[i].key,
        value: this.values[this.keys.get(definedIndices[i].key)]
      }
      if (this.indices[i].hasOwnProperty('type')) arg.type = this.indices[i].type;
      yield arg
    }
    return;
  }

  * readImplicitArgumentValues() {
    for (let key of this.implicit.keys()) {
      yield { key: key, value: this.implicit.get(key) }
    }
    return;
  }

  * readDeclarations() {
    for (let i = 0; i < this.indices.length; i++) {
      yield { index: i, ...this.indices[i] }
    }
    return;
  }

  getDefinedKeys(): Declaration[] {
    let unassigned = [];
    for (let i = 0; i < this.indices.length; i++) {
      if (this.values[i] !== undefined) {
        unassigned.push(this.indices[i]);
      }
    }
    return unassigned;
  }

  getUndefinedKeys(): string[] {
    let unassigned = [];
    for (let i = 0; i < this.indices.length; i++) {
      if (this.values[i] === undefined) {
        unassigned.push(this.indices[i].key);
      }
    }
    return unassigned;
  }

  copyDeclarations(): Declaration[] {
    let declarations = [];
    for (let i = 0; i < this.indices.length; i++) {
      let declarationCopy: any = {
        value: this.indices[i].key
      }
      if (this.indices[i].hasOwnProperty('type')) {
        declarationCopy.type = this.indices[i].type;
      }
      declarations.push((declarationCopy as Declaration));
    }
    return declarations;
  }

  toParams(): Param[] {
    let params = [];
    for (let i = 0; i < this.indices.length; i++) {
      let param: any = {
        key: this.indices[i].key
      }
      if (this.indices[i].hasOwnProperty('type')) {
        param.type = this.indices[i].type;
      }
      params.push(param);
    }
    return params;
  }

  toJSON(): ArgumentMap<string> {
    return {
      // need to move to utils
      keys: obj.fromMap(this.keys),
      indices: this.copyDeclarations(),
      values: this.values.map(a => a),
      implicit: obj.fromMap(this.implicit)
    }
  }

  declaredArgumentCount(): number {
    return this.indices.length;
  }

  shuntKnownValues(): { urlQueryString: string, remaining: FunctionArguments, shunted: { [key: number]: Indices } } {
    let hash = '';
    let firstAgain = true;
    let shunted: { [key: number]: Indices } = {};
    let remaining = [];

    for (let index = 0; index < this.indices.length; index++) {
      let wasShunted = false;
      if (this.values[index] !== undefined) {
        if (firstAgain) firstAgain = false;
        else hash += '&';
        wasShunted = true;
        if (this.indices[index].key !== undefined) {
          hash += this.indices[index].key;
          if (this.values[index] !== undefined )  hash += '=';
        }
        hash += this.values[index];
      }

      let indices: Indices = this.indices[index];

      if (wasShunted) {
        shunted[index] = indices;
      } else {
        remaining.push(indices);
      }
    }

    let remainingArguments = FunctionArguments.create(remaining);
    return { urlQueryString: hash, remaining: remainingArguments, shunted: shunted }
  }

  toUrlParams(override = false) {
    let hash = '';
    let firstAgain = true;
    for (let index = 0; index < this.indices.length; index++) {
      if (this.values[index] !== undefined) {

        if (firstAgain) firstAgain = false;
        else hash += '&';

        if (this.indices[index].key !== undefined) {

          let key = (typeof this.indices[index].key !== 'string') ? this.indices[index].key.toString() : this.indices[index].key;
          let value = (typeof this.values[index] !== 'string') ? this.values[index].toString() : this.values[index];

          //console.log("KEY IS: ",  this.indices[index].key, typeof this.indices[index].key)
          //console.log("VALUE IS: ", this.values[index], typeof  this.values[index])

          //console.log("DEFAULT IS NOT DEFINED", key)
          //console.log("VALUE IS: ", value);


          hash += key; 
          hash += '=';
          hash += value;
        }

      } else if (this.indices[index].defaults !== undefined) {
        if (firstAgain) firstAgain = false;
        else hash += '&';

        if (this.indices[index].key !== undefined) {
          let key = (typeof this.indices[index].key !== 'string') ? this.indices[index].key.toString() : this.indices[index].key;
          let value = (typeof this.indices[index].defaults !== 'string') ? this.indices[index].defaults.toString() : this.indices[index].defaults;
          //console.log("DEFAULT IS NOT DEFINED", key)
          //console.log("VALUE IS: ", value);

          hash += key; 
          hash += '=';
          hash += value;
        }
      } else if (this.indices[index].hasOwnProperty('optional') || override) {

      } else {
        throw new Error(`Cannot convert function arguments to url since they ` +
          `are missing a required parameter of: ${this.indices[index].key}. ` +
          `If you which to override this call this function with the input argument 'override' ` +
          ` set to true`);
      }
    }
    return hash;
  }

  static fromJSON(json: Param.JSON[] | { [key: string]: any }) {
    let result;
    if (Array.isArray(json)) {

      let params = Array.from(json).map(json => Param.fromJSON(json));

      result = FunctionArguments.create(params);

    } else {

      if (json['keys'] !== undefined && 
          json['values'] !== undefined && 
          json['implicit'] !== undefined &&
          json['indices'] !== undefined) {

        let args = new FunctionArguments([]);
        args.indices = json['indices'].map(i => Declaration.fromJSON(i))
        for (let key of Object.keys(json['keys'])) {
          args.keys.set(key, json['keys'][key])
        }
        args.values = json.values.map(i => i);
        for (let key of Object.keys(json['implicit'])) {
          args.implicit.set(key, Argument.fromJSON(json['implicit'][key]))
        }
        return args;

      } else {
        let params: any[] = [];
        for (let key of Object.keys(json)) {
          let input: Param.JSON = { value: json[key] };
          params.push(new Param(input));
        }
        result = FunctionArguments.create(params);
      }
    }

   //console.log("RESULT IS: ", result)

    return result;
  }

  /**
   * Accept a set of declarations with potential values and then function arguments 
   * which should map to them.
   * 
   * The first input contains the set of indices we want to map the secondary arguments onto.
   * 
   * If keys are found within these objects, which aren't required for resolution
   * of the declarations we still store them in the function arguments under the 
   * keyword 'implicit arguments', only preserving the first observed value under
   * each new key.
   * 
   * This method effectively asks as an object mapper along with a resolution
   * hierarchy.
   */
  static resolve(indices: Indices[], ...resolveOrderAll: (FunctionArguments.JSON | FunctionArguments)[]): FunctionArguments {

    let resolveOrder = [];
    for (let item of resolveOrderAll) {
      if (item instanceof FunctionArguments) resolveOrder.push(item.toParams().map(param => param.toJSON()));
      else resolveOrder.push(item);
    }

    let argSet: FunctionArguments = FunctionArguments.create(indices);
    let assigned = new Set<number>(obj.fill(argSet.declaredArgumentCount(), (n) => n));

    for (let argObject of resolveOrder) {
      let argList: FunctionArguments = FunctionArguments.fromJSON(argObject);
      for (let arg of argList.readDefinedArgumentValues()) {
        /* check if the inputs contains an argument for a key we haven't found yet */
        if (argSet.hasDeclarationNamed(arg.key)) {
          let index = argSet.getIndexOfDeclarationName(arg.key);
          if (assigned.has(index)) {
            assigned.delete(index);
            argSet.setDeclaredValue(arg.key, arg.value);
          }
        } else if (!argSet.hasImplicitArgumentNamed(arg.key)) {
          /* and if not, then it is a new, extra, unrequired argument */
          argSet.setImplicitValue(arg.key, arg.value);
        }
      }
    }
    return argSet;
  }

  static merge(indices: Indices[], args: FunctionArguments): FunctionArguments {
    let known = new Set<string>();
    for (let index of indices) known.has(index.key);
    args.getIndices()

    return FunctionArguments.fromJSON(indices.concat(args.getIndices().filter(
      index => !known.has(index.key)
    )))
  }


  [Symbol.iterator]() {
    return this.readDefinedArgumentValues();
  }

  static create(indices: Indices[]) {
    return new FunctionArguments(indices);
  }

  static Builder = class {

    indeterminedArg: any
    params: Param[]

    constructor() {
      this.params = [];
    }


    setArgument(value: any) {
      if (this.indeterminedArg !== undefined) {
        this.params.push(new Param({ value: this.indeterminedArg,   }));
      }
      this.indeterminedArg = value;
      return this;
    }

    setArgumentValue(value: any) {
      if (this.indeterminedArg === undefined) {
        throw new Error(`Need to set argument in builder before calling set argument value!`);
      }

      this.params.push(new Param({ value: value, key: this.indeterminedArg as string }))
      this.indeterminedArg = undefined;
      return this;
    }

    build() {

      if (this.indeterminedArg !== undefined) {
        this.params.push(new Param({ value: this.indeterminedArg }));
      }

     //console.log("CREATING ARGUMENTS WITH: ", this.params);
      return new FunctionArguments(this.params);
    }
  }

}

export namespace FunctionArguments {

  export namespace JSON {

    export type Array = Param.JSON[]

    export type Object = { [key: string]: string }

  }

  export type JSON = JSON.Array | JSON.Object

}


export { Argument, Param, Declaration  }
export { FunctionArguments as Arguments }
