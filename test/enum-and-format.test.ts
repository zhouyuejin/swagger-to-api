import { describe, it, expect } from 'vitest';
import { parse } from '../src/core/parser.js';
import { PinyinNamingStrategy } from '../src/core/naming.js';
import { emit } from '../src/core/emitter.js';
import type { SwaggerDoc } from '../src/core/types.js';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function emitAll(result: ReturnType<typeof parse>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'p1-'));
  emit(result, { input: 'x', output: dir });
  const files = readdirSync(path.join(dir, 'models'));
  const content = files.map((f) => readFileSync(path.join(dir, 'models', f), 'utf8')).join('\n---\n');
  rmSync(dir, { recursive: true, force: true });
  return content;
}

describe('P1: enum', () => {
  it('顶层 enum definition 生成 type alias 而非 object type', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' }, paths: {},
      definitions: {
        OrderStatus: {
          type: 'string',
          description: '订单状态',
          enum: ['PENDING', 'ACTIVE', 'CLOSED'],
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { $ref: '#/definitions/OrderStatus' },
          },
        },
      },
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    const out = emitAll(r);

    // OrderStatus 应该是字面量联合类型
    expect(out).toMatch(/export type OrderStatus = 'PENDING' \| 'ACTIVE' \| 'CLOSED'/);
    // Order 引用 OrderStatus，类型不变
    expect(out).toMatch(/status\?: OrderStatus/);
  });

  it('integer enum 也正确生成', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' }, paths: {},
      definitions: {
        Priority: {
          type: 'integer',
          enum: [1, 2, 3],
        },
      },
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    const out = emitAll(r);
    expect(out).toMatch(/export type Priority = 1 \| 2 \| 3/);
  });

  it('enum 模型不出现在内联对象路径', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' }, paths: {},
      definitions: {
        Color: { type: 'string', enum: ['RED', 'BLUE'] },
        Product: { type: 'object', properties: { color: { type: 'string', enum: ['RED', 'BLUE'] } } },
      },
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    const out = emitAll(r);
    // Color 是 named type alias
    expect(out).toMatch(/export type Color =/);
    // 内联 enum 在 Product 里保持原样（inline 字面量）
    expect(out).toMatch(/color\?: 'RED' \| 'BLUE'/);
  });
});

describe('P1: format', () => {
  it('format: date-time 在生成代码里有 JSDoc 注释', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' }, paths: {},
      definitions: {
        Event: {
          type: 'object',
          properties: { createdAt: { type: 'string', format: 'date-time' } },
        },
      },
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    const out = emitAll(r);
    expect(out).toMatch(/createdAt\?: string;/);
    expect(out).toMatch(/date-time/);  // JSDoc 里提到
  });

  it('format: binary 映射成 Blob', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' }, paths: {},
      definitions: {
        Upload: {
          type: 'object',
          properties: { file: { type: 'string', format: 'binary' } },
        },
      },
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    const out = emitAll(r);
    expect(out).toMatch(/file\?: Blob/);
  });

  it('format: int64 仍是 number，但 JSDoc 提示精度', () => {
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' }, paths: {},
      definitions: {
        Money: {
          type: 'object',
          properties: { amount: { type: 'integer', format: 'int64' } },
        },
      },
    };
    const r = parse(doc, new PinyinNamingStrategy({ warnOnFallback: false }));
    const out = emitAll(r);
    expect(out).toMatch(/amount\?: number/);
    expect(out).toMatch(/int64|bignumber|bigint|精度/);
  });
});
