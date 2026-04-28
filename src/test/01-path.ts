// ─────────────────────────────────────────────────────────────────────────
// Path: dual-mode (VERSION vs STAGE), round-trip with URL params,
// PathReference type discrimination.
// ─────────────────────────────────────────────────────────────────────────

import { Path, PathReference, PathType } from '../index.js';

export default async (test: (name: string, body: (validator: any) => any) => any) => {
  await test('Path.fromString parses VERSION mode', async (validator: any) => {
    const v = Path.fromString('src/main.ts/1234567890');
    return validator.expect({
      type: v.type,
      version: v.version,
      namespace: v.namespace,
    }).toLookLike({ type: 'VERSION', version: 1234567890, namespace: 'src/main.ts' });
  });

  await test('Path.fromString parses STAGE mode', async (validator: any) => {
    const s = Path.fromString('src/main.ts/LIVE');
    return validator.expect({
      type: s.type,
      stage: s.stage,
      isLive: s.isLive(),
    }).toLookLike({ type: 'STAGE', stage: 'LIVE', isLive: true });
  });

  await test('Path round-trips namespace, version, and URL params', async (validator: any) => {
    const original = 'src/app.ts/1234?encoding=ts&env=prod';
    const serialized = Path.fromString(original).toString();
    return validator.expect({
      hasNamespace: serialized.includes('src/app.ts'),
      hasVersion: serialized.includes('1234'),
      hasParam: serialized.includes('encoding=ts'),
    }).toLookLike({ hasNamespace: true, hasVersion: true, hasParam: true });
  });

  await test('PathReference discriminates ABSOLUTE / RELATIVE / LIBRARY / STORAGE', async (validator: any) => {
    return validator.expect({
      abs: new PathReference('/workspace/src/app.ts/LIVE').pathType,
      rel: new PathReference('./helpers/util.ts/LIVE').pathType,
      lib: new PathReference('lodash').pathType,
      store: new PathReference('@:workspace:config').pathType,
    }).toLookLike({
      abs: PathType.ABSOLUTE,
      rel: PathType.RELATIVE,
      lib: PathType.LIBRARY,
      store: PathType.STORAGE,
    });
  });
};
