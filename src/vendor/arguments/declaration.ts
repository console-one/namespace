

import * as obj from '../utils.js';


export class Declaration {

  defaults?: string
  key?: string
  type?: string


  constructor(input?: {
    key?: string,
    type?: string,
    defaults?: any
  }) {

    obj.underride(this,
      obj.prune(
        (fnc) => fnc.value !== undefined
      )(input === undefined ? {} : input)
    );

  }

  toJSON() {
    return obj.prune((fnc) => fnc.value !== undefined)({
      defaults: this.defaults,
      key: this.key,
      type: this.type
    });
  }

  get assignmentIdentifier() {
    return this.key + (this.defaults !== undefined) ? this.defaults : '';
  }

  serialize() {
    return JSON.stringify(this.toJSON());
  }

  hashKey() {
    return this.key;
  }

  static fromJSON(input: any) {
    return new Declaration(input);
  }

  static deserialize(str: string) {
    return Declaration.fromJSON(JSON.parse(str));
  }
}

export namespace Declaration {
  export type JSON = {
    defaults?: any
    key?: string
    type?: any
  }
}