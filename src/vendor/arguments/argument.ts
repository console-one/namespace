


export class Argument {

  constructor(
    public value: any,
    public key?: string
  ) { }

  toJSON() {
    let json: any = { value: this.value };
    if (this.key !== undefined) json.key = this.key;
    return json
  }

  static fromJSON(arg: any) {
    return new Argument(arg.value, arg.key);
  }
}
