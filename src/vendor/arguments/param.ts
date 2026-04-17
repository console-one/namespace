
import * as obj from '../utils.js';

export class Param {

  value?: string
  key?: string
  type?: string

  constructor(input?: {
    value?: string,
    key?: string,
    type?: string
  }) {

    obj.underride(this,
      obj.prune(
        (fnc) => fnc.value !== undefined
      )(input === undefined ? {} : input)
    );

  }

  toJSON() {
    return obj.prune((fnc) => fnc.value !== undefined)({
      value: this.value,
      key: this.key,
      type: this.type
    })
  }

  static fromJSON(input: any) {
    return new Param(input);
  }
}

export namespace Param {

  export type JSON = { key?: string, value?: string, type?: string }

}
