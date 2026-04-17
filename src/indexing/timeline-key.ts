
export class TimelineKey {

  constructor(
    public type: string,
    public seq: number,
    public key?: string) {
  }

  toJSON() {
    let json: any = { type: this.type, seq: this.seq };
    if (this.key !== undefined) json.key = this.key;
    return json;
  }

  toString() {
    let keyPart = (this.key !== undefined) ? `:${this.key}` : ``
    return `${this.type}${keyPart}:${this.seq}`
  }

  static DeleteKey = () => {
    return new TimelineKey('DELETE', (new Date()).getTime())
  }

  static fromArgs(typeOrTimelineKey: TimelineKey | string, keystring?: string, delim?: string) {
    let timelineKey: TimelineKey;
    if (typeof typeOrTimelineKey === 'string') {
      if (keystring === undefined) {
        throw new Error(`A key string - unique identifier for an item of some type
          must be provided if the first arguemnt of get() is not a timeline key.`)
      } else {
        let delimeter = (delim !== undefined) ? delim : ':';
        let parts = keystring.split(delimeter);
        if (parts.length > 2) {
          throw new Error(`Invalid string provided - seq and key parts of the timeline 
            key for ${typeOrTimelineKey} cannot be determined. Keystrign was ${keystring}
            and delimeter was: ${delim}`)
        }
        if (parts.length > 1) {
          timelineKey = new TimelineKey(typeOrTimelineKey, Number(parts[1]), parts[0]);
        } else {
          timelineKey = new TimelineKey(typeOrTimelineKey, Number(parts[0]));
        }
      }
    } else {
      timelineKey = typeOrTimelineKey;
    }
    return timelineKey;
  }

  static fromString(str) {
    let parts = str.split(':');
    if ((parts.length < 2 || parts.length > 3) || !/^[0-9]/g.test(parts.slice(-1)[0])) {
      let message = `This is not a valid timeline key: ${str}. ` + 
        `The key must contain either one or two non-adjacent, starting or terminating, ` + 
        `semi colons with the text proceeding the terminal colon only containing numeric ` + 
        `character values. IE: myType:myKey:12345, myType:5432, etc. `
      throw new Error(message)
    }
    let type = parts[0];
    let seq = parts.slice(-1)[0];
    if (parts.length > 2) return new TimelineKey(type, seq, parts[1]);
    return new TimelineKey(type, seq);
  }

  static fromJSON = (obj: any) => {
    if ((obj === undefined) || (obj === null)) return obj;
    return (obj.hasOwnProperty('key')) ? new TimelineKey(obj.type, obj.seq, obj.key) : new TimelineKey(obj.type, obj.seq);
  }

  static serializer = Object.freeze({ 
    atob: (tlineKey) => tlineKey.toString(), 
    btoa: (str) => {
      if (str === null) return undefined;
      return TimelineKey.fromString(str)
    }
  })

}