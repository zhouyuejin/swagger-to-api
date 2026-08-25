/**
 * 命名策略：
 *   - NamingStrategy: 接口，可由调用方注入自定义实现
 *   - PinyinNamingStrategy: 内置默认实现，中文 → 拼音 PascalCase
 *   - resolveConflicts(): 同模块内函数名冲突的三级兜底消歧
 */
import { pinyin } from 'pinyin-pro';
import type { ApiFunction } from './types.js';

export interface NamingStrategy {
  /** swagger definitions 名 → TypeScript 类型名（PascalCase） */
  modelName(defName: string): string;
  /** operationId → 导出函数名（camelCase） */
  functionName(operationId: string): string;
  /** URL path → 模块名（camelCase 段名） */
  moduleName(urlPath: string): string;
}

/** TypeScript / JavaScript 保留字，不能做函数名 */
const RESERVED_WORDS = new Set([
  'delete', 'import', 'export', 'default', 'class', 'extends', 'super',
  'new', 'function', 'var', 'let', 'const', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'return', 'throw', 'try',
  'catch', 'finally', 'typeof', 'instanceof', 'in', 'of', 'void', 'null',
  'undefined', 'true', 'false', 'this', 'yield', 'async', 'await',
  'interface', 'type', 'enum', 'implements', 'package', 'private',
  'protected', 'public', 'static', 'abstract', 'as', 'any', 'boolean',
  'number', 'string', 'symbol', 'never', 'object', 'readonly',
]);

export interface PinyinNamingStrategyOptions {
  /** 中文名 → 英文名 映射 */
  nameMap?: Record<string, string>;
  /** 是否在命中拼音兜底时打印警告，默认 true */
  warnOnFallback?: boolean;
}

/** 内置拼音命名策略 */
export class PinyinNamingStrategy implements NamingStrategy {
  private readonly nameMap: Record<string, string>;
  private readonly warnOnFallback: boolean;
  private readonly pinyinCache = new Map<string, string>();

  constructor(options: PinyinNamingStrategyOptions = {}) {
    this.nameMap = options.nameMap ?? {};
    this.warnOnFallback = options.warnOnFallback ?? true;
  }

  /** 中文串 → PascalCase 拼音（带缓存） */
  toPinyinPascal(chinese: string): string {
    const cached = this.pinyinCache.get(chinese);
    if (cached !== undefined) return cached;
    // 整串交给 pinyin-pro：自带上下文判断，多音字比手写字表更准；非中文字符保留。
    const segments = pinyin(chinese, { toneType: 'none', type: 'array' });
    let acc = '';
    for (let i = 0; i < chinese.length; i++) {
      const ch = chinese[i];
      if (/[A-Za-z0-9_]/.test(ch)) {
        acc += ch;
        continue;
      }
      const seg = segments[i];
      if (!seg) continue;
      acc += seg.charAt(0).toUpperCase() + seg.slice(1);
    }
    // 保留 _N 后缀：后端对重名泛型自动加的 _1/_2 是稳定路径的一部分
    const cleaned = acc.replace(/[^A-Za-z0-9_]/g, '');
    this.pinyinCache.set(chinese, cleaned);
    return cleaned;
  }

  modelName(defName: string): string {
    // 已是英文开头：仍清理非法字符（后端 swagger 偶尔带 - 等）
    if (/^[A-Za-z]/.test(defName)) {
      return defName.replace(/[^A-Za-z0-9_]/g, '');
    }
    if (this.nameMap[defName]) return this.nameMap[defName];
    const py = this.toPinyinPascal(defName);
    if (this.warnOnFallback) {
      console.warn(`  \u26A0 未配置映射: "${defName}" → "${py}"（拼音兜底），建议补到 nameMap`);
    }
    return py;
  }

  functionName(operationId: string): string {
    // 去掉 Spring 的 UsingMETHOD 后缀 与 swagger 自动加的 _N 后缀
    const name = operationId.replace(/Using[A-Z]+(_\d+)?$/, '');
    const result = name.charAt(0).toLowerCase() + name.slice(1);
    if (RESERVED_WORDS.has(result)) return '_' + result;
    return result;
  }

  moduleName(urlPath: string): string {
    // 剥 /api/ 前缀；剥开头斜杠（个别接口不带 /api/ 时 split 首段会变空）
    const segments = urlPath.replace(/^\/api\//, '').replace(/^\/+/, '').split('/');
    return segments[0] || 'default';
  }
}

/**
 * 同模块内函数名冲突处理（三级兜底）：
 *   1) HTTP 方法前缀消歧：auth/auth/auth/auth (GET/POST/PUT/DELETE) → getAuth/saveAuth/updateAuth/removeAuth
 *   2) 同方法仍撞名（同一 operationId 出现在不同 URL）→ 用 URL 末段重命名
 *   3) URL 末段也撞（同 URL + 同 operationId 真重复）→ 加 _1/_2 数字后缀
 */
export function resolveConflicts(funcs: ApiFunction[]): void {
  const nameCount: Record<string, number> = {};
  for (const f of funcs) nameCount[f.name] = (nameCount[f.name] || 0) + 1;
  if (!Object.values(nameCount).some((c) => c > 1)) return;

  // 第一步：方法前缀
  for (const f of funcs) {
    if (nameCount[f.name] > 1) {
      const m = f.method.toLowerCase();
      const prefixes: Record<string, string> = {
        get: 'get', post: 'save', put: 'update', delete: 'remove', patch: 'patch',
      };
      const prefix = prefixes[m] || m;
      f.name = prefix + f.name.charAt(0).toUpperCase() + f.name.slice(1);
    }
  }
  // 第二步：URL 末段
  const second: Record<string, number> = {};
  for (const f of funcs) second[f.name] = (second[f.name] || 0) + 1;
  const hardCollision = new Set(Object.entries(second).filter(([, c]) => c > 1).map(([n]) => n));
  if (hardCollision.size > 0) {
    console.warn(`  \u26A0 检测到 ${hardCollision.size} 个 operationId 在同一模块内重复（多半是后端 swagger 标重），已按 URL 末段重命名，请同步后端修 operationId：`);
    for (const f of funcs) {
      if (!hardCollision.has(f.name)) continue;
      const segments = f.url.split('/').filter(Boolean);
      const lastSeg = segments[segments.length - 1] || f.name;
      const renamed = lastSeg.charAt(0).toLowerCase() + lastSeg.slice(1);
      console.warn(`      ${f.method} ${f.url}  →  ${renamed}`);
      f.name = renamed;
    }
    // 第三步：数字后缀
    const third: Record<string, number> = {};
    for (const f of funcs) third[f.name] = (third[f.name] || 0) + 1;
    let n = 1;
    for (const f of funcs) {
      if (third[f.name] > 1) f.name = `${f.name}_${n++}`;
    }
  }
}
