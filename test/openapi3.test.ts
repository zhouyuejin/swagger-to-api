import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { PinyinNamingStrategy } from '../src/core/naming.js';
import { emit } from '../src/core/emitter.js';
import type { OpenAPIDoc } from '../src/core/types.js';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function emitAll(result: ReturnType<typeof parse>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'oas3-'));
  emit(result, { input: 'x', output: dir });
  const files = readdirSync(path.join(dir, 'models'));
  const content = files.map((f) => readFileSync(path.join(dir, 'models', f), 'utf8')).join('\n---\n');
  rmSync(dir, { recursive: true, force: true });
  return content;
}

describe('P1: OpenAPI 3.x 支持', () => {
  it('自动检测 OAS3 文档并走 components.schemas 路径', () => {
    const oas3: OpenAPIDoc = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
      components: {
        schemas: {
          LoginDTO: {
            type: 'object',
            required: ['username', 'password'],
            properties: {
              username: { type: 'string' },
              password: { type: 'string' },
            },
          },
        },
      },
    };
    const r = parse(oas3, new PinyinNamingStrategy({ warnOnFallback: false }));
    expect(r.models.has('LoginDTO')).toBe(true);
    const m = r.models.get('LoginDTO')!;
    expect(m.properties.find((p) => p.name === 'username')!.required).toBe(true);
  });

  it('requestBody (application/json) 解析成 body 参数', () => {
    const oas3: OpenAPIDoc = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/api/auth/login': {
          post: {
            operationId: 'loginUsingPOST',
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/LoginDTO' } },
              },
            },
            responses: {
              '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/响应结果«TokenDTO»' } } } },
            },
          },
        },
      },
      components: {
        schemas: {
          LoginDTO: { type: 'object', properties: { username: { type: 'string' } } },
          TokenDTO: { type: 'object', properties: { token: { type: 'string' } } },
          '响应结果«TokenDTO»': { type: 'object', properties: { code: { type: 'integer' }, data: { $ref: '#/components/schemas/TokenDTO' } } },
        },
      },
    };
    const r = parse(oas3, new PinyinNamingStrategy({ warnOnFallback: false }));
    const fn = r.modules.get('auth')!.functions.find((f) => f.name === 'login')!;
    expect(fn.params.body).not.toBeNull();
    expect(fn.params.body!.type).toBe('LoginDTO');
    expect(fn.returnType).toBe('TokenDTO');
  });

  it('OAS3 $ref: #/components/schemas/X 解析正确', () => {
    const oas3: OpenAPIDoc = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/api/x': {
          get: {
            operationId: 'getXUsingGET',
            responses: {
              '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserInfo' } } } },
            },
          },
        },
      },
      components: {
        schemas: {
          UserInfo: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              avatar: { $ref: '#/components/schemas/Avatar' },
            },
          },
          Avatar: { type: 'object', properties: { url: { type: 'string' } } },
        },
      },
    };
    const r = parse(oas3, new PinyinNamingStrategy({ warnOnFallback: false }));
    const u = r.models.get('UserInfo')!;
    expect(u.properties.find((p) => p.name === 'avatar')!.type).toBe('Avatar');
  });

  it('multipart/form-data 字段展开成 formData 参数', () => {
    const oas3: OpenAPIDoc = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/api/upload': {
          post: {
            operationId: 'uploadFileUsingPOST',
            requestBody: {
              required: true,
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    required: ['file'],
                    properties: {
                      file: { type: 'string', format: 'binary' },
                      note: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: { schemas: {} },
    };
    const r = parse(oas3, new PinyinNamingStrategy({ warnOnFallback: false }));
    const fn = r.modules.get('upload')!.functions.find((f) => f.name === 'uploadFile')!;
    // multipart/form-data 合并成单个 body schema，运行时负责 multipart 编码
    expect(fn.params.body).not.toBeNull();
    const bodyType = fn.params.body!.type;
    expect(bodyType).toMatch(/file.*Blob|note/);
    // 字段都在 schema 里（生成的 service 是 uploadFile(data: { file: Blob, note: string })）
  });

  it('OAS3 生成的 service 沿用同一 emitter（import + 函数签名一致）', () => {
    const oas3: OpenAPIDoc = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/api/items': {
          get: {
            operationId: 'listItemsUsingGET',
            responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Item' } } } } } },
          },
        },
      },
      components: {
        schemas: { Item: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } },
      },
    };
    const r = parse(oas3, new PinyinNamingStrategy({ warnOnFallback: false }));
    const out = emitAll(r);
    expect(out).toMatch(/export type Item = \{[\s\S]*id\?: string/);
    expect(out).toMatch(/name\?: string/);
  });
});
