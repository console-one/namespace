/**
 * Minimal subset of core/utils/functional/object used by path, monitor, and
 * the vendored arguments module. Eight functions instead of the source's
 * 380-line module.
 *
 * Source semantics preserved where needed (underride mutates-and-returns its
 * first argument; clone handles reference cycles via structuredClone).
 */

export const underride = <A extends object, B extends object>(a: A, b: B): A & B => {
  for (const key of Object.keys(b as any)) {
    if ((a as any)[key] === undefined) (a as any)[key] = (b as any)[key]
  }
  return a as any
}

export const select = (...keys: string[]) => (obj: any) => {
  const out: any = {}
  for (const key of keys) {
    if (obj != null && Object.prototype.hasOwnProperty.call(obj, key)) {
      out[key] = obj[key]
    }
  }
  return out
}

export const omit = (...keys: string[]) => (obj: any) => {
  const skip = new Set(keys)
  const out: any = {}
  for (const key of Object.keys(obj)) {
    if (!skip.has(key)) out[key] = obj[key]
  }
  return out
}

export const has = (prop: string) => (obj: any) => {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, prop)
}

export const fromMap = <V>(map: Map<any, V>): { [key: string]: V } => {
  const out: { [key: string]: V } = {}
  for (const [k, v] of map.entries()) out[String(k)] = v
  return out
}

export const fill = <V>(n: number, fn: (i: number) => V = (i => i as any)): V[] => {
  const out: V[] = []
  for (let i = 0; i < n; i++) out.push(fn(i))
  return out
}

/**
 * Deep clone. structuredClone (Node 17+) handles cycles natively; falls back
 * to JSON round-trip for primitive-only data.
 */
export const clone = <T>(data: T): T => {
  if (data === null || data === undefined || typeof data !== 'object') return data
  if (typeof (globalThis as any).structuredClone === 'function') {
    return (globalThis as any).structuredClone(data)
  }
  return JSON.parse(JSON.stringify(data))
}

export const prune = (
  rowFilter: (entry: { key: any; value: any }) => boolean = () => true,
  subselect: (value: any, key: any) => any = v => v
) => (obj: any) => {
  const out: any = {}
  for (const key of Object.keys(obj)) {
    if (rowFilter({ key, value: obj[key] })) out[key] = subselect(obj[key], key)
  }
  return out
}
