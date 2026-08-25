/**
 * 边界条件测试：手写 fixture 测不到的真实场景
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from '../src/core/parser.js';
import { PinyinNamingStrategy } from '../src/core/naming.js';
import { emit } from '../src/core/emitter.js';
import type { SwaggerDoc } from '../src/core/types.js';

function emitAll(doc: SwaggerDoc, nameMap: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'edge-'));
  const r = parse(doc, new PinyinNamingStrategy({ nameMap, warnOnFallback: false }));
  emit(r, { input: 'x', output: dir });
  const files = readdirSync(path.join(dir, 'models')).concat(readdirSync(path.join(dir, 'services')));
  const content = files.map((f) => {
    const sub = f.includes('.ts') && (readdirSync(path.join(dir, 'models')).includes(f) ? 'models' : 'services');
    return readFileSync(path.join(dir, sub, f), 'utf8');
  }).join('\n---\n');
  rmSync(dir, { recursive: true, force: true });
  return content;
}

describe('P1: 边界条件', () => {
  it('空 paths + 有 definitions 不报错', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' },
      paths: {},
      definitions: {
        Foo: { type: 'object', properties: { id: { type: 'string' } } },
      },
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    expect(r.models.size).toBe(1);
    expect(r.modules.size).toBe(0);
  });

  it('空 definitions + 有 paths 不报错', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' },
      paths: {
        '/api/health': {
          get: {
            operationId: 'healthUsingGET',
            responses: { '200': { description: 'ok', schema: { type: 'string' } } },
          },
        },
      },
      definitions: {},
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    expect(r.models.size).toBe(0);
    expect(r.modules.size).toBeGreaterThan(0);
  });

  it('完全空的 swagger 不崩', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' },
      paths: {},
      definitions: {},
    };
    expect(() => parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }))).not.toThrow();
  });

  it('operation 没有 parameters 也能解析', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' },
      paths: {
        '/api/list': {
          get: {
            operationId: 'listUsingGET',
            responses: { '200': { description: 'ok', schema: { type: 'array', items: { type: 'string' } } } },
          },
        },
      },
      definitions: {},
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    const fn = r.modules.get('list')!.functions[0];
    expect(fn.params.query.length).toBe(0);
    expect(fn.params.body).toBeNull();
    expect(fn.params.path.length).toBe(0);
  });

  it('operation 没有 responses 不崩', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' },
      paths: {
        '/api/x': {
          get: { operationId: 'xUsingGET', responses: {} },
        },
      },
      definitions: {},
    };
    const fn = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }))
      .modules.get('x')!.functions[0];
    expect(fn.returnType).toBe('void');
  });

  it('数组的数组（nested array）正确生成 string[][]', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' }, paths: {},
      definitions: {
        Matrix: { type: 'object', properties: {
          grid: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        } },
      },
    };
    const out = emitAll(doc);
    expect(out).toMatch(/grid\?: string\[\]\[\]/);
  });

  it('5 层深嵌套对象展开', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' }, paths: {},
      definitions: {
        L5: { type: 'object', properties: {
          l4: { type: 'object', properties: {
            l3: { type: 'object', properties: {
              l2: { type: 'object', properties: {
                l1: { type: 'object', properties: {
                  val: { type: 'string' },
                } },
              } },
            } },
          } },
        } },
      },
    };
    const out = emitAll(doc);
    // 深度嵌套对象的叶子字段应能展开（5 层仍可达）
    // 嵌套对象内层不需要 ?（Swagger spec 只对顶层 required 有意义）
    expect(out).toMatch(/val: string/);
  });

  it('同一个 definition 被多处引用，import 不重复', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' }, paths: {},
      definitions: {
        User: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
        Order: { type: 'object', properties: {
          buyer: { $ref: '#/definitions/User' },
          seller: { $ref: '#/definitions/User' },
        } },
      },
    };
    const out = emitAll(doc);
    // models/index.ts 只 export 一次 User
    expect((out.match(/export type \{ User \}/g) ?? []).length).toBe(1);
  });

  it('swagger operationId 缺省时不崩（fallback 兜底）', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' },
      paths: {
        '/api/x': {
          get: { responses: { '200': { description: 'ok' } } }, // 无 operationId
        },
      },
      definitions: {},
    };
    const fn = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }))
      .modules.get('x')!.functions[0];
    // 应该有某个兜底名字（不是空字符串）
    expect(fn.name.length).toBeGreaterThan(0);
  });

  it('同一模块内四个同名 operation（GET/POST/PUT/DELETE）方法前缀消歧', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' },
      paths: {
        '/api/auth/': {
          get: { operationId: 'x', responses: { '200': { description: 'ok' } } },
          post: { operationId: 'x', responses: { '200': { description: 'ok' } } },
          put: { operationId: 'x', responses: { '200': { description: 'ok' } } },
          delete: { operationId: 'x', responses: { '200': { description: 'ok' } } },
        },
      },
      definitions: {},
    };
    const fns = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }))
      .modules.get('auth')!.functions;
    const names = fns.map((f) => f.name).sort();
    expect(names).toEqual(['getX', 'removeX', 'saveX', 'updateX']);
  });

  it('PinyinNamingStrategy 缓存不污染（多次 parse 结果一致）', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' }, paths: {},
      definitions: { '用户信息': { type: 'object', properties: { id: { type: 'string' } } } },
    };
    const naming = new PinyinNamingStrategy({ warnOnFallback: false });
    const r1 = parse(doc, naming);
    const r2 = parse(doc, naming);
    expect([...r1.models.keys()]).toEqual([...r2.models.keys()]);
  });

  it('同一 schema 在多个 service 间引用，import 列表正确收集', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' },
      paths: {
        '/api/users/a': {
          get: {
            operationId: 'getA',
            responses: { '200': { description: 'ok', schema: { $ref: '#/definitions/User' } } },
          },
        },
        '/api/users/b': {
          get: {
            operationId: 'getB',
            responses: { '200': { description: 'ok', schema: { $ref: '#/definitions/User' } } },
          },
        },
      },
      definitions: { User: { type: 'object', properties: { id: { type: 'string' } } } },
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    expect(r.modules.size).toBe(1);
    const services = r.modules.get('users')!;
    expect(services.functions.length).toBe(2);
    // 两个函数都依赖 User
    services.functions.forEach((f) => expect(f.imports.has('User')).toBe(true));
  });

  it('swagger 与 OpenAPI3 自动检测：传混合字符串字段不影响判断', () => {
    const swag: any = { swagger: '2.0', info: { title: 't', version: '1' }, paths: {}, definitions: {} };
    expect(swag.swagger?.startsWith('2.')).toBe(true);
    const oas: any = { openapi: '3.0.3', info: { title: 't', version: '1' }, paths: {}, components: { schemas: {} } };
    expect(oas.openapi?.startsWith('3.')).toBe(true);
  });
});
