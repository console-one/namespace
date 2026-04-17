


const DEFAULT_INDEX = 'LIVE'
import { Arguments, Argument } from './vendor/arguments/index.js';
import { Path, PathType, PathReference } from './path.js'

export class Version {

  public type: 'VERSION'
  public params: Arguments
  public location: [mode: string, occurance: number][]

  constructor(
    public namespace: string,
    public version: number,
    paramsInput?: Arguments | Argument[],
    location?: [mode: string, occurance: number][]
  ) {
    if (paramsInput === undefined) paramsInput = [];
    if (location === undefined) {
      this.location = [];
    } else {
      this.location = location.map(i => [i[0], i[1]]);
    }

    let params: Arguments = (Array.isArray(paramsInput)) ? Arguments.create(paramsInput) : paramsInput;
    this.params = params;
    this.type = 'VERSION'
  }

  get ns(): string {
    let initialComponent = this.namespace;
    let urlParams = this.params.toUrlParams(true);
    if (urlParams.length < 1) return initialComponent;
    return initialComponent + '?' + urlParams;
  }
  
  get path(): string {
    return `${this.namespace}/${this.version}`;
  }

  get index(): string {
    return this.version + ''
  }

  hashKey() {
    return this.shunted.path;
  }

  toPath(): Path {
    return new Path(this.namespace, this.version, this.params, this.location);
  }

  toString(): string {
    let initialComponent: string = this.path;
    let urlParams = this.params.toUrlParams(true);
    if (urlParams.length < 1) return initialComponent;
    return initialComponent + '?' + urlParams;
  }

  toJSON(): Version.JSON {

    console.log("THIS: ", this);
    return {
      namespace: this.namespace,
      version: this.version,
      params: this.params.getIndices().map(i => i)
    }
  }

  withParams(args: Arguments) {

    console.log("Indices: ", this.params.getIndices());
    console.log("Args: ", args);

    let mergeResult = Arguments.merge(this.params.getIndices(), args);
    return new Version(this.namespace, this.version, mergeResult );
  }

  asParams(pathKey: string = 'path') {
    return Arguments.resolve([{ key: pathKey, value: this.path }], this.params);
  }

  get filetype() {
    let namespaceBeforeParamsIndex = this.namespace.indexOf('?');
    let namespaceBeforeParams = this.namespace.slice(0, namespaceBeforeParamsIndex);
    let lastPeriodBeforeParams = namespaceBeforeParams.indexOf('.');
    if (lastPeriodBeforeParams < 0) return 'const';
    return this.namespace.slice(lastPeriodBeforeParams+1);
  }

  get shunted() {
    let newParams = this.params.getIndices().filter(index =>
      index.value !== undefined);
    if (newParams.length > 0) {
      let result = this.params.shuntKnownValues();
      return new Path(
        this.path + '?' + result.urlQueryString,
        this.index,
        result.remaining,
        this.location);
    } else {
      return this;
    }
  }

  static fromString(str: string) {
    let paramsParts = str.split('?')
    let namespaceIndexParts = paramsParts[0];
    let parts = namespaceIndexParts.split('/');
    if (parts.length < 2) {
      throw new Error('A version number needs to be supplied for this to be considered valid! ')
    } 
    let namespace = parts.slice(0, parts.length - 1).join('/')
    let version = Number(parts.slice(parts.length-1))
    let params = [];
    let location = [];

    if (paramsParts.length > 1) {
      let paramStrings = paramsParts[1].split('&');
      for (let paramString of paramStrings) {
        let paramAspects = paramString.split('=');
        if ((paramAspects.length > 1) && paramAspects[0] === 'submode') {
          let lastPart = paramAspects[1];
          let modeDelimited = lastPart.split(':');
          let lastPathPart = modeDelimited[0];
          let modeStrings = modeDelimited.slice(1);
          for (let modeString of modeStrings) {
            let modeParts = modeString.split(',');
            if ((modeParts.length !== 2) || /^[0-9]./g.test(modeParts[1])) {
              throw new Error(`Cannot convert string: [\n${str}\n] into snippet as there needs to be ` +
                ` a comma between consecutive ':' symbols. Before the comma, the mode name is required, ` +
                ` and after the comma its occurance # within the parent mode or document.`)
            }
            location.push([modeParts[0], Number(modeParts[1])]);
          }
        } else {
          let param;
          if (paramAspects.length > 1) {
            param = new Argument(paramAspects[1], paramAspects[0]);
          } else {
            param = new Argument(paramAspects[0]);
          }
          params.push(param);
        }
      }
    }
    let fargs = new Arguments(params);
    return new Version(namespace, version, fargs, location);
  }

  static fromJSON(input: Version.JSON): Version {

    if (input.params === undefined) input.params = [];

    input.params = Arguments.fromJSON(input.params);

    return new Version(input.namespace, input.version, input.params, input.location);
  }
}

export namespace Version {
  export type JSON = {
    namespace: string,
    version: number,
    params?: any,
    location?: any
  }
}

