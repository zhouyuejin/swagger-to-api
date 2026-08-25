import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { PinyinNamingStrategy } from '../src/core/naming.js';
import { emit } from '../src/core/emitter.js';
import { RUNTIME_TEMPLATE } from '../src/core/runtime-template.js';
import type { SwaggerDoc } from '../src/core/types.js';

/**
 * P0-1: 业务正确性 — required 字段必须不被标为 optional
 * P0-2: 循环引用 — 不能栈溢出，要正确生成 TS 自引用类型
 */
describe('P0: required fields', () => {
  it('definitions.required 数组里的字段在 ModelProperty.required 体现', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0',
      info: { title: 't', version: '1' },
      paths: {},
      definitions: {
        LoginDTO: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string' },
            captcha: { type: 'string' },
          },
        },
      },
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    const m = r.models.get('LoginDTO')!;
    expect(m.properties.find((p) => p.name === 'username')!.required).toBe(true);
    expect(m.properties.find((p) => p.name === 'password')!.required).toBe(true);
    expect(m.properties.find((p) => p.name === 'captcha')!.required).toBe(false);
  });

  it('emit 输出 required 字段不加 ?:', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' }, paths: {},
      definitions: {
        LoginDTO: {
          type: 'object',
          required: ['username'],
          properties: { username: { type: 'string' }, captcha: { type: 'string' } },
        },
      },
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    const out = emitToString(r);
    expect(out).toMatch(/username: string;/);          // 不加 ?
    expect(out).toMatch(/captcha\?: string;/);          // 保持 ?
  });
});

describe('P0: circular references', () => {
  it('自引用（数组 + 直接引用）不栈溢出', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' }, paths: {},
      definitions: {
        TreeNode: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            children: { type: 'array', items: { $ref: '#/definitions/TreeNode' } },
            parent: { $ref: '#/definitions/TreeNode' },
          },
        },
      },
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    const m = r.models.get('TreeNode')!;
    // 自引用应解析为类型名本身（不是 any 也不是 inline）
    expect(m.properties.find((p) => p.name === 'children')!.type).toBe('TreeNode[]');
    expect(m.properties.find((p) => p.name === 'parent')!.type).toBe('TreeNode');
  });

  it('互引用（A 包含 B，B 包含 A）不栈溢出', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' }, paths: {},
      definitions: {
        Department: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            employees: { type: 'array', items: { $ref: '#/definitions/Employee' } },
          },
        },
        Employee: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            department: { $ref: '#/definitions/Department' },
          },
        },
      },
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    expect(r.models.has('Department')).toBe(true);
    expect(r.models.has('Employee')).toBe(true);
    const dept = r.models.get('Department')!;
    expect(dept.properties.find((p) => p.name === 'employees')!.type).toBe('Employee[]');
    const emp = r.models.get('Employee')!;
    expect(emp.properties.find((p) => p.name === 'department')!.type).toBe('Department');
  });
});

describe('P0: runtime template safety', () => {
  it('默认 runtime 模板含超时控制', () => {
    expect(RUNTIME_TEMPLATE).toMatch(/AbortSignal|signal/i);
    expect(RUNTIME_TEMPLATE).toMatch(/timeout/i);
  });
  it('默认 runtime 模板导出结构化 ApiError', () => {
    expect(RUNTIME_TEMPLATE).toMatch(/class ApiError|interface ApiError|type ApiError/);
    expect(RUNTIME_TEMPLATE).toMatch(/status\??:\s*number/);
  });
});

// helper: 把所有 model 文件内容拼成一个字符串方便断言
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

function emitToString(result: ReturnType<typeof parse>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'p0-'));
  emit(result, { input: 'x', output: dir });
  const out = fs.readdirSync(path.join(dir, 'models')).map((f) => fs.readFileSync(path.join(dir, 'models', f), 'utf8')).join('\n');
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}
