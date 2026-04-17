

const DEFAULT_INDEX = 'LIVE'
import { Arguments, Argument } from './vendor/arguments/index.js';

export class Path {

  public type: 'VERSION' | 'STAGE'
  public version?: number
  public stage?: string
  public params: Arguments
  public location: [mode: string, occurance: number][]

  constructor(
    public namespace: string, 
    index: number | string, 
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
    if(/^[0-9]./.test(index + '')) {
      this.type = 'VERSION';
      this.version = Number(index);
    } else {
      this.type = 'STAGE';
      this.stage = index + '';
    }
  }

  get ns(): string {
    let initialComponent = this.namespace;
    let urlParams = this.params.toUrlParams(true);
    if (urlParams.length < 1) return initialComponent;
    return initialComponent + '?' + urlParams;
  }

  get path(): string {
    return `${this.namespace}/${(this.type === 'VERSION') ? (this.version + '') : this.stage}`;
  }

  get index(): string {
    return this.isLive() ? this.stage : this.version + '';
  }

  hashKey() {
    return this.shunted.path;
  }

  isLive() {
    return this.type !== 'VERSION'
  }

  get step(): string {
    return 
  }

  toString() : string {
    let initialComponent: string = this.path;
    let urlParams = this.params.toUrlParams(true);
    if (urlParams.length < 1) return initialComponent;
    return initialComponent + '?' + urlParams;
  }

  toJSON(): Path.JSON {
    return {
      namespace: this.namespace,
      index: this.index,
      params: this.params.toJSON()
    }
  }

  /*
  * Adds any additional parameters on top of the currently defined. 
  * Defaults to the currently defined params if a new param is added
  * to an existing one. 
  */
  withParams(args: Arguments) {
    return new Path(this.namespace, this.index, Arguments.resolve(this.params.getIndices(), args));
  }

  asParams(pathKey: string = 'path') {
    return Arguments.resolve([{ key: 'path', value: this.path }], this.params);
  }

  get filetype() {
    let namespaceBeforeParamsIndex = this.namespace.indexOf('?');
    let namespaceBeforeParams = this.namespace.slice(0, namespaceBeforeParamsIndex);
    let lastPeriodBeforeParams = namespaceBeforeParams.indexOf('.');
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
    // console.log("PATH STR IS: ", str)
    let paramsParts = str.split('?')
    let namespaceIndexParts = paramsParts[0]; 

    let parts = namespaceIndexParts.split('/');
    let namespace = parts.length > 1 ? parts.slice(0, parts.length-1).join('/') : parts[parts.length-1];
    let index = parts.length > 1 ? parts[parts.length - 1] : DEFAULT_INDEX;

    let params = [];
    if (paramsParts.length > 1) {
      
      let paramStrings = paramsParts[1].split('&');
      for (let paramString of paramStrings) {
        let paramAspects = paramString.split('=');
        let param = (paramAspects.length > 1) ? new Argument(paramAspects[1], paramAspects[0]) : new Argument(paramAspects[0]);
        params.push(param);
      }
    }

    let fargs = new Arguments(params);
    return new Path(namespace, index, fargs);

  }

  static fromJSON(input: Path.JSON) : Path {
    if (input.index === undefined) input.index = 'LIVE'
    if (input.params === undefined) input.params = [];
    return new Path(input.namespace, input.index, input.params);
  }
}

export namespace Path {
  export type JSON = {
    namespace: string,
    index?: string | number,
    params?: any
  }
}


export enum PathType {
  ABSOLUTE,
  RELATIVE,
  STORAGE,
  LIBRARY
}


export class PathReference {

  path: string

  pathType: PathType

  format: 'import' | 'local' | 'external'

  constructor(str: string, format: 'import' | 'local' | 'external' = 'import') {
    this.path = str;
    this.pathType = PathReference.decodeType(str);
    this.format = format;
  }

  /**
  * Valid path conversions:  
  * 
  * ./hello (from some/file.xyz) -> 'some/hello.xyz/LIVE'
  * ./hello.xyz/LIVE (from ./some/file.xyz) -> 'some/hello.xyz/LIVE'
  * ./hello.xyz/1242 (from ./some/file.xyz) -> 'some/hello.xyz/1242'
  * ./../hello (from ./some/file.xyz) ->  'hello.xyz/LIVE'
  * ./hello.xyz/EU (from ./some/file.xyz) -> 'some/hello.xyz/EU'
  * /hello (from some/file.xyz) -> 'hello.xyz/LIVE'
  * /hello.xyz/LIVE (from ./some/file.xyz) -> 'hello.xyz/LIVE'
  * /hello.xyz/1242 (from ./some/file.xyz) -> 'hello.xyz/1242'
  * /../hello (from ./some/file.xyz) ->  'hello.xyz/LIVE'
  * /hello.xyz/EU (from ./some/file.xyz) -> 'hello.xyz/EU'
  */
  getPath(options: { referencePoint?: Path, defaultMode?: string }): Path {

    let referencePoint = options.referencePoint;
    let defaultMode = options.defaultMode;
    let absolutePath;

    if (this.format === 'external') {
      // console.log("SHOULD CREATE EXTERNAL PATH FROM REFERENCE POINT: ", options);

    }

    if (this.pathType === PathType.RELATIVE) {
      if (referencePoint === undefined) {
        throw new Error(`Path provided to be resolved: ${this.path} is relative and thus to be resolved a ` +
          ` reference point is required, and none were provided!`);
      }
      absolutePath = '';

      // let firstChar = referencePoint.namespace.charAt(0);
      // if (firstChar !== '.' && firstChar !== '/') {
      //   if (this.format === 'local' && (firstChar !== '.' && firstChar !== '/')) {
      //     referencePoint.namespace = '/' + referencePoint.namespace;
      //   }
      // }

      let referencePointDirs = referencePoint.namespace.split('/');
      let relativePathParts = this.path.split('/');
      let currentPathDirIndex = 0;
      let currentLookupDirective = relativePathParts[currentPathDirIndex];

      while (currentLookupDirective.charAt(0) === '.') {

        if (currentLookupDirective === '..') {
          if (relativePathParts.length < 1) {
            throw new Error(`Cannot create path since no directory exists. ` +
              ` ".." used too many times in relative path, which infers a file before the root` +
              ` directory! Filepath is: ${this.path}`);
          }
          referencePointDirs.pop();

        } else if (currentLookupDirective !== '.') {
          throw new Error(`Cannot create a path with a directory or file that starts with a '.' symbol!. ${this.path} provided.`)
        }

        currentPathDirIndex += 1;
        // NOTE: Definitely a potential bug here (instinct tells me to revist)
        if ((currentPathDirIndex) >= relativePathParts.length) break;
        currentLookupDirective = relativePathParts[currentPathDirIndex];
      }
      // console.log("currentPathDirIndex ended with ", currentPathDirIndex)
      let partsAfterLookups = relativePathParts.slice(currentPathDirIndex);
      absolutePath = referencePointDirs.slice(0, -1).concat(partsAfterLookups).join('/');
    
    }

    if (this.pathType !== PathType.LIBRARY) {

      if (this.pathType === PathType.STORAGE || this.pathType === PathType.ABSOLUTE) {
        if (this.path.charAt(0) === '/') absolutePath = this.path.slice(1)
        else absolutePath = this.path;
      }

      let index: string | number;
      let namespace: string;

      if (absolutePath.indexOf('/') > 0) {
        let parts = absolutePath.split('/');
        let lastPart = parts[parts.length - 1];
        let hasStageOrVersion = (lastPart.indexOf('.') < 0) && ((parts.length > 1) || parts[parts.length - 2].indexOf('.') >= 0)
        
        if (hasStageOrVersion) {
          let isVersion = /^[0-9]./.test(lastPart + '');
          if (isVersion) index = Number(lastPart);
          else index = lastPart;
          namespace = parts.slice(0, -1).join('/')
        } else {
          index = DEFAULT_INDEX;
          if (lastPart.indexOf('.') < 0) {
            if (defaultMode === undefined) {
              throw new Error(`Path provided to be resolved: ${this.path} requires a default mode since it does not provide one!`);
            } else {
              namespace = parts.join('/') + '.' + defaultMode;
            }
          } else {
            namespace = parts.join('/')
          }
        }
      } else {
        namespace = absolutePath
        index = referencePoint.index
      }

      if (this.pathType === PathType.ABSOLUTE || this.pathType === PathType.RELATIVE) {
        return new Path(namespace, index, []);
      } else {
        return new Path('@:workspace:' + absolutePath, 'LIVE')
      }
    } else if (this.pathType === PathType.LIBRARY) {
      return new Path(this.path, 'LIVE');
    } else {
      // console.log("External path type: ", this.path)
      return new Path(this.path, 'LIVE');
    }

  }

  toString() {
    return this.path;
  }

  serialize() {
    return JSON.stringify(this.toJSON());
  }

  toJSON() {
    return {
      path: this.path,
      pathType: this.pathType,
      format: this.format
    }
  }


  static decodeType(str: string) {
    if (str.length < 1) throw new Error(`A path reference cannot be empty!`);
    if (str.charAt(0) === '/') {
      return PathType.ABSOLUTE;
    } else if (str.indexOf(':') > -1) {
      return PathType.STORAGE;
    } else if (str.charAt(0) !== '.') {
      return PathType.LIBRARY;
    } else {
      return PathType.RELATIVE;
    }
  }

  static deserialize(str: any) {
    let obj = JSON.parse(str);
    return PathReference.fromJSON(obj);
  }

  static fromJSON(json: any) {
    if (typeof json === 'string') {
      return new PathReference(json);
    } else {
      return new PathReference(json.path, json.format);
    }

  }
}