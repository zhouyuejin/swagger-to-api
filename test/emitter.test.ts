import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from '../src/core/parser.js';
import { emit } from '../src/core/emitter.js';
import { PinyinNamingStrategy } from '../src/core/naming.js';
import type { SwaggerDoc } from '../src/core/types.js';

const fixture: SwaggerDoc = JSON.parse(
  readFileSync(path.resolve(__dirname, '..', 'fixtures', 'swagger-sample.json'), 'utf8'),
);

let outDir: string;

beforeEach(() => {
  outDir = mkdtempSync(path.join(tmpdir(), 'swagger-to-api-'));
});

describe('emit', () => {
  it('生成完整目录结构', () => {
    const result = parse(fixture, new PinyinNamingStrategy({ warnOnFallback: false }));
    emit(result, { input: 'x', output: outDir });

    expect(existsSync(path.join(outDir, 'runtime.ts'))).toBe(true);
    expect(existsSync(path.join(outDir, 'models', 'PageVO.ts'))).toBe(true);
    expect(existsSync(path.join(outDir, 'models', 'index.ts'))).toBe(true);
    expect(existsSync(path.join(outDir, 'services', 'auth.ts'))).toBe(true);
    expect(existsSync(path.join(outDir, 'services', 'supplier.ts'))).toBe(true);
    expect(existsSync(path.join(outDir, 'services', 'dingTalk.ts'))).toBe(true);
    expect(existsSync(path.join(outDir, 'index.ts'))).toBe(true);
  });

  it('runtime 模板已存在时不覆盖', () => {
    const result = parse(fixture, new PinyinNamingStrategy({ warnOnFallback: false }));
    const custom = '// 用户自定义内容\n';
    // 提前写入 runtime.ts
    require('node:fs').writeFileSync(path.join(outDir, 'runtime.ts'), custom);
    emit(result, { input: 'x', output: outDir });
    expect(readFileSync(path.join(outDir, 'runtime.ts'), 'utf8')).toBe(custom);
  });

  it('emitRuntimeTemplate=false 时不写 runtime', () => {
    const result = parse(fixture, new PinyinNamingStrategy({ warnOnFallback: false }));
    emit(result, { input: 'x', output: outDir, emitRuntimeTemplate: false });
    expect(existsSync(path.join(outDir, 'runtime.ts'))).toBe(false);
  });

  it('runtimeImport 可自定义', () => {
    const result = parse(fixture, new PinyinNamingStrategy({ warnOnFallback: false }));
    emit(result, { input: 'x', output: outDir, runtimeImport: '../../shared/http' });
    const auth = readFileSync(path.join(outDir, 'services', 'auth.ts'), 'utf8');
    expect(auth).toContain(`import { http } from '../../shared/http';`);
  });

  it('service 文件正确解构 GET / POST-with-body / DELETE / 无 body', () => {
    const result = parse(fixture, new PinyinNamingStrategy({ warnOnFallback: false }));
    emit(result, { input: 'x', output: outDir });

    const supplier = readFileSync(path.join(outDir, 'services', 'supplier.ts'), 'utf8');

    // saveSupplier: POST + body → postJson
    expect(supplier).toMatch(/export function saveSupplier\(data: QiYeXinXi\): Promise<void> \{/);
    expect(supplier).toContain(`http.postJson<void>('/api/supplier/save', data)`);

    // pageSupplier: GET + query → get + 参数
    expect(supplier).toMatch(/export function pageSupplier\(params:/);
    expect(supplier).toContain(`http.get<PageVO<QiYeXinXi>>('/api/supplier/page', params)`);

    // deleteSupplier: DELETE + path
    expect(supplier).toContain('http.get<void>(`/api/supplier/delete/${id}`)');
  });

  it('顶层 index.ts 用 namespace alias 解决跨模块冲突', () => {
    // 构造一个会产生跨模块冲突的 swagger：两个不同模块都有 getInfo
    const doc: SwaggerDoc = {
      swagger: '2.0', info: { title: 't', version: '1' },
      paths: {
        '/api/a/info': { get: { operationId: 'getInfo', responses: { '200': { description: 'ok', schema: { $ref: '#/definitions/响应结果«string»' } } } } },
        '/api/b/info': { get: { operationId: 'getInfo', responses: { '200': { description: 'ok', schema: { $ref: '#/definitions/响应结果«string»' } } } } },
      },
      definitions: {
        '响应结果«string»': { type: 'object', properties: { data: { type: 'string' } } },
      },
    };
    const result = parse(doc, new PinyinNamingStrategy());
    emit(result, { input: 'x', output: outDir });
    const idx = readFileSync(path.join(outDir, 'index.ts'), 'utf8');
    expect(idx).toContain(`getInfo as aGetInfo`);
    expect(idx).toContain(`getInfo as bGetInfo`);
  });

  afterEach(() => rmSync(outDir, { recursive: true, force: true }));
});
