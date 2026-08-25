import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/core/parser.js';
import { PinyinNamingStrategy } from '../src/core/naming.js';
import type { SwaggerDoc } from '../src/core/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture: SwaggerDoc = JSON.parse(
  readFileSync(path.resolve(__dirname, '..', 'fixtures', 'swagger-sample.json'), 'utf8'),
);

describe('parse', () => {
  it('解析 definitions → models，跳过响应结果与分页容器', () => {
    const r = parse(fixture, new PinyinNamingStrategy({ warnOnFallback: false }));
    // fixture 里有 TokenDTO, UserInfo, LoginDTO, 企业信息 四个业务 DTO
    expect(r.models.size).toBe(4);
    expect(r.models.has('TokenDTO')).toBe(true);
    expect(r.models.has('UserInfo')).toBe(true);
    expect(r.models.has('LoginDTO')).toBe(true);
    expect(r.models.has('QiYeXinXi')).toBe(true); // 企业信息 拼音兜底
    // 分页容器/统一响应体不应作为 model 出现
    expect(r.models.has('PageVO')).toBe(false);
    expect(r.models.has('XiangYingJieGuoVoid')).toBe(false);
  });

  it('解析 paths → modules 并按 /api/ 切分模块', () => {
    const r = parse(fixture, new PinyinNamingStrategy({ warnOnFallback: false }));
    expect(r.modules.has('auth')).toBe(true);
    expect(r.modules.has('supplier')).toBe(true);
    expect(r.modules.has('dingTalk')).toBe(true);
    expect(r.modules.get('auth')!.functions.map((f) => f.name).sort()).toEqual(['getInfo', 'login']);
    expect(r.modules.get('supplier')!.functions.map((f) => f.name).sort()).toEqual(['deleteSupplier', 'pageSupplier', 'saveSupplier']);
  });

  it('解包统一响应体得到实际返回类型', () => {
    const r = parse(fixture, new PinyinNamingStrategy({ warnOnFallback: false }));
    const authLogin = r.modules.get('auth')!.functions.find((f) => f.name === 'login')!;
    expect(authLogin.returnType).toBe('TokenDTO');
    const authInfo = r.modules.get('auth')!.functions.find((f) => f.name === 'getInfo')!;
    expect(authInfo.returnType).toBe('UserInfo');
    const save = r.modules.get('supplier')!.functions.find((f) => f.name === 'saveSupplier')!;
    expect(save.returnType).toBe('void'); // 响应结果«Void» → void
  });

  it('分页接口还原成 PageVO<T>', () => {
    const r = parse(fixture, new PinyinNamingStrategy({ warnOnFallback: false }));
    const page = r.modules.get('supplier')!.functions.find((f) => f.name === 'pageSupplier')!;
    expect(page.returnType).toBe('PageVO<QiYeXinXi>');
  });

  it('收集每个函数的 imports（含 PageVO）', () => {
    const r = parse(fixture, new PinyinNamingStrategy({ warnOnFallback: false }));
    const page = r.modules.get('supplier')!.functions.find((f) => f.name === 'pageSupplier')!;
    expect(page.imports.has('PageVO')).toBe(true);
    expect(page.imports.has('QiYeXinXi')).toBe(true);
  });
});
