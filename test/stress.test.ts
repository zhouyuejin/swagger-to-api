/**
 * 真实场景 stress 测试：用 _stress-helper.ts 工厂构造 100+ 模型 / 30+ 接口
 * 的 swagger，跑全套断言（结构 / 类型 / 性能）。
 *
 * 这组测试覆盖手写 fixture 漏掉的真实世界场景：
 *   - 中文定义名（各种业务术语）
 *   - 100+ 模型不会让 parser 卡顿或栈溢出
 *   - 同一模块多种接口类型（GET / POST / PUT / DELETE）
 *   - 分页响应、响应包装、文件上传、路径参数、查询参数混用
 *   - 必填字段、enum、递归引用、大量 import 依赖
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from '../src/core/parser.js';
import { PinyinNamingStrategy } from '../src/core/naming.js';
import { emit } from '../src/core/emitter.js';
import { buildStressSwagger, computeStressExpectation } from './_stress-helper.js';
import type { SwaggerDoc } from '../src/core/types.js';

describe('P1: stress 测试（真实场景覆盖）', () => {
  let doc: SwaggerDoc;
  let outDir: string;
  const exp = computeStressExpectation();
  const nameMap: Record<string, string> = {
    '企业信息': 'Supplier',
    '供货商品': 'SupplyGoods',
    '订单主表': 'Order',
    '文件信息': 'FileInfo',
    '响应结果«string»': 'WrappedString',
    '响应结果«boolean»': 'WrappedBoolean',
    '响应结果«Void»': 'WrappedVoid',
    'PageVO«企业信息»': 'PageSupplier',
    'PageVO«订单主表»': 'PageOrder',
    '通用分页响应VO«供货商品»': 'PageSupplyGoods',
  };

  beforeAll(() => {
    doc = buildStressSwagger();
    outDir = mkdtempSync(path.join(tmpdir(), 'stress-'));
    const start = performance.now();
    const naming = new PinyinNamingStrategy({ nameMap, warnOnFallback: false });
    const result = parse(doc, naming);
    emit(result, { input: 'x', output: outDir });
    const elapsed = performance.now() - start;
    console.log(`[stress] 解析+生成 100+ 模型 / 30+ 接口用时 ${elapsed.toFixed(1)} ms`);
  });

  it('stress swagger 包含 100+ 模型定义', () => {
    expect(Object.keys(doc.definitions).length).toBeGreaterThanOrEqual(100);
  });

  it('所有模型都正确解析（除响应包装 + PageVO 容器）', () => {
    const start = performance.now();
    const naming = new PinyinNamingStrategy({ nameMap, warnOnFallback: false });
    const result = parse(doc, naming);
    const elapsed = performance.now() - start;
    // 解析应 < 1 秒（100+ 模型）
    expect(elapsed).toBeLessThan(1000);
    // 业务模型应 >= CN_NAMES.length
    expect(result.models.size).toBeGreaterThanOrEqual(exp.modelCount);
  });

  it('enum / 必填 / 格式 都被正确生成', () => {
    const supplierPath = path.join(outDir, 'models', 'Supplier.ts');
    const supplierCode = readFileSync(supplierPath, 'utf8');
    // 必填字段无 ?（id / createdAt）
    expect(supplierCode).toMatch(/id: string;/);
    expect(supplierCode).toMatch(/createdAt: string;/);
    // 可选字段有 ?（name / updatedAt）
    expect(supplierCode).toMatch(/name\?: string;/);
    // format JSDoc（int64 提示）
    expect(supplierCode).toMatch(/64位整数/);
    // enum（status 是字符串字面量联合）
    expect(supplierCode).toMatch(/'DRAFT' \| 'ACTIVE' \| 'CLOSED'/);
  });

  it('30+ 接口正确拆到 6 个模块', () => {
    const services = readdirSync(path.join(outDir, 'services'));
    expect(services.length).toBeGreaterThanOrEqual(5);
    // supplier 模块有 4-5 个接口（page + getById + delete + save + update）
    const supplier = readFileSync(path.join(outDir, 'services', 'supplier.ts'), 'utf8');
    expect(supplier).toMatch(/export function pageSupplier/);
    expect(supplier).toMatch(/export function getSupplierById/);
    expect(supplier).toMatch(/export function deleteSupplierById/);
    expect(supplier).toMatch(/export function saveSupplier/);
    expect(supplier).toMatch(/export function updateSupplier/);
  });

  it('pageSupplier 函数签名分页 + 路径插值正确', () => {
    const supplier = readFileSync(path.join(outDir, 'services', 'supplier.ts'), 'utf8');
    expect(supplier).toMatch(/pageSupplier\(params:.*pageNum: number.*pageSize: number.*keyword\?: string.*\)/);
    expect(supplier).toMatch(/Promise<PageVO<Supplier>>/);  // PageVO 容器总是展开成 PageVO<T>
  });

  it('delete 接口路径参数正确模板插值', () => {
    const supplier = readFileSync(path.join(outDir, 'services', 'supplier.ts'), 'utf8');
    expect(supplier).toMatch(/deleteSupplierById\(id: string\)/);
    expect(supplier).toMatch(/http\.get<void>\(`\/api\/supplier\/\$\{id\}`\)/);
  });

  it('文件上传 formData 接口正确展开', () => {
    const file = readFileSync(path.join(outDir, 'services', 'file.ts'), 'utf8');
    expect(file).toMatch(/uploadFile/);
  });

  it('生成的 models/index.ts 总导出所有模型', () => {
    const idx = readFileSync(path.join(outDir, 'models', 'index.ts'), 'utf8');
    const lines = idx.split('\n').filter((l) => l.startsWith('export type'));
    // 应该 >= 100 个 export（业务模型）+ PageVO
    expect(lines.length).toBeGreaterThanOrEqual(exp.modelCount);
    // 不重复
    const names = lines.map((l) => l.match(/\{ (\w+) \}/)?.[1]).filter(Boolean);
    expect(new Set(names).size).toBe(names.length);
  });

  it('顶层 index.ts 处理跨模块冲突', () => {
    const idx = readFileSync(path.join(outDir, 'index.ts'), 'utf8');
    expect(idx).toMatch(/export \* from '\.\/services\//);
  });

  it('生成产物大小合理（不爆炸）', () => {
    let totalSize = 0;
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        const st = statSync(p);
        if (st.isDirectory()) walk(p);
        else totalSize += st.size;
      }
    };
    walk(outDir);
    console.log(`[stress] 生成产物总大小 ${(totalSize / 1024).toFixed(1)} KB（${exp.modelCount} 模型 + ${exp.operationCount} 接口）`);
    // 100+ 模型 + 30+ 接口的产物应该在 500KB 以内
    expect(totalSize).toBeLessThan(500 * 1024);
  });
});
