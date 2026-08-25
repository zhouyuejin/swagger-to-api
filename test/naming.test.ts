import { describe, it, expect } from 'vitest';
import { PinyinNamingStrategy, resolveConflicts } from '../src/core/naming.js';
import type { ApiFunction } from '../src/core/types.js';

describe('PinyinNamingStrategy', () => {
  it('英文名清理非法字符', () => {
    const s = new PinyinNamingStrategy();
    expect(s.modelName('Foo-Bar')).toBe('FooBar');
    expect(s.modelName('Bar.Baz')).toBe('BarBaz');
  });

  it('中文命中映射表', () => {
    const s = new PinyinNamingStrategy({ nameMap: { 企业信息: 'Supplier' } });
    expect(s.modelName('企业信息')).toBe('Supplier');
  });

  it('中文走拼音兜底', () => {
    const s = new PinyinNamingStrategy({ warnOnFallback: false });
    expect(s.modelName('验证码返回对象')).toBe('YanZhengMaFanHuiDuiXiang');
  });

  it('functionName 去 UsingMETHOD 后缀并小写首字母', () => {
    const s = new PinyinNamingStrategy();
    expect(s.functionName('loginUsingPOST')).toBe('login');
    expect(s.functionName('getInfoUsingGET_1')).toBe('getInfo');
  });

  it('functionName 保留字加下划线前缀', () => {
    const s = new PinyinNamingStrategy();
    expect(s.functionName('deleteUsingDELETE')).toBe('_delete');
  });

  it('moduleName 剥 /api/ 前缀取首段', () => {
    const s = new PinyinNamingStrategy();
    expect(s.moduleName('/api/supplierInfo/pageAuditBySchool')).toBe('supplierInfo');
    expect(s.moduleName('/api/auth/login')).toBe('auth');
    expect(s.moduleName('/dingTalk/callback')).toBe('dingTalk');
    expect(s.moduleName('/')).toBe('default');
  });
});

describe('resolveConflicts', () => {
  function f(name: string, method: ApiFunction['method'], url: string): ApiFunction {
    return {
      name, method, url,
      params: { query: [], body: null, path: [], imports: new Set() },
      returnType: 'void', summary: '', consumes: [], imports: new Set(),
    };
  }

  it('无冲突时不动名字', () => {
    const funcs = [f('a', 'GET', '/x'), f('b', 'POST', '/y')];
    resolveConflicts(funcs);
    expect(funcs.map((x) => x.name)).toEqual(['a', 'b']);
  });

  it('第一步：方法前缀消歧', () => {
    const funcs = [f('auth', 'GET', '/a'), f('auth', 'POST', '/b'), f('auth', 'PUT', '/c'), f('auth', 'DELETE', '/d')];
    resolveConflicts(funcs);
    expect(funcs.map((x) => x.name)).toEqual(['getAuth', 'saveAuth', 'updateAuth', 'removeAuth']);
  });

  it('第二步：URL 末段消歧', () => {
    const funcs = [
      f('getReigiterInfo', 'GET', '/supplier/projectRegister/getReigiterInfo'),
      f('getReigiterInfo', 'GET', '/supplier/sampleConfirm/getSampleInfo'),
    ];
    resolveConflicts(funcs);
    expect(funcs[0].name).toBe('getReigiterInfo');
    expect(funcs[1].name).toBe('getSampleInfo');
  });
});
