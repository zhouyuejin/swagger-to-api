/**
 * 代码生成器：将 ParseResult 写出到磁盘
 *
 * 目录布局：
 *   <output>/
 *     runtime.ts            ← 默认 runtime 模板（如 emitRuntimeTemplate=true 且文件不存在）
 *     models/
 *       PageVO.ts
 *       <ModelA>.ts
 *       ...
 *       index.ts            ← models 总导出
 *     services/
 *       <moduleA>.ts        ← 每个模块一个文件
 *       ...
 *     index.ts              ← 顶层入口，处理跨模块函数名冲突
 *
 * 关键设计：
 *   - runtime 导入路径（http）通过 runtimeImport 配置（相对 services/），默认 '../runtime'
 *   - HTTP 方法名通过 httpMethodMap 配置，默认 { simple: { GET:'get', ...; POST:'post' }, withBody: { POST:'postJson', ... } }
 *   - 跨模块函数名冲突：在顶层 index.ts 中加模块前缀 alias 消歧
 *   - 路径参数 {id} / {name} 自动转成 ${id} / ${name} 模板插值
 */
import fs from 'node:fs';
import path from 'node:path';
import type {
  ApiFunction, GenerateConfig, HttpMethodMap, Model, Module, ParseResult, PathParam, QueryParam,
} from './types.js';
import { RUNTIME_TEMPLATE } from './runtime-template.js';

const HEADER = `/* eslint-disable */
/* prettier-ignore */
// 自动生成，请勿手动编辑 — 运行 @zhouyuejin1995/swagger-to-api 重新生成
`;

const DEFAULT_HTTP_METHOD_MAP: HttpMethodMap = {
  simple: { GET: 'get', DELETE: 'get', POST: 'post', PUT: 'post', PATCH: 'post' },
  withBody: { POST: 'postJson', PUT: 'postJson', PATCH: 'postJson' },
};

function emitPageVO(dir: string): void {
  const content = `${HEADER}
/** 分页结果 */
export type PageVO<T> = {
  /** 数据列表 */
  list: T[];
  /** 当前页码 */
  pageNum: number;
  /** 每页数量 */
  pageSize: number;
  /** 总页数 */
  pages: number;
  /** 总记录数 */
  total: number;
};
`;
  fs.writeFileSync(path.join(dir, 'PageVO.ts'), content);
}

function emitModel(dir: string, model: Model): void {
  const { name, description, properties, imports } = model;
  const filtered = [...imports].filter((i) => i !== name); // 过滤自引用
  let content = HEADER;
  if (filtered.length > 0) {
    const list = filtered.map((i) => `  ${i}`).join(',\n');
    content += `import type {\n${list}\n} from './index';\n\n`;
  }
  const descLine = description ? `/** ${description} */\n` : '';
  content += `${descLine}export type ${name} = {\n`;
  for (const prop of properties) {
    const desc = prop.description ? `  /** ${prop.description} */\n` : '';
    content += `${desc}  ${prop.name}?: ${prop.type};\n`;
  }
  content += '};\n';
  fs.writeFileSync(path.join(dir, `${name}.ts`), content);
}

function emitModelsIndex(dir: string, models: Map<string, Model>): void {
  let content = HEADER;
  content += `export type { PageVO } from './PageVO';\n`;
  const sorted = [...models.keys()].sort();
  for (const name of sorted) content += `export type { ${name} } from './${name}';\n`;
  fs.writeFileSync(path.join(dir, 'index.ts'), content);
}

function emitQueryParamsType(query: QueryParam[]): string {
  const props = query
    .map((p) => {
      const desc = p.description ? `/** ${p.description} */ ` : '';
      const optional = p.required ? '' : '?';
      return `${desc}${p.name}${optional}: ${p.type}`;
    })
    .join('; ');
  return `params: { ${props} }`;
}

/** 把 {id} {name} 等路径占位符替换成 ${id} ${name}，并用模板字面量包裹 */
function buildUrlString(url: string, pathParams: PathParam[]): string {
  if (!pathParams.length) return `'${url}'`;
  // 避免在源码中写裸 ${}（JS 模板字面量语义），改成运行时拼接
  const dollar = String.fromCharCode(36); // '$'
  const interpolated = url.replace(/\{(\w+)\}/g, (_m, name) => `${dollar}{${name}}`);
  return '`' + interpolated + '`';
}

/** 把 query 参数拼到 URL 上（用于非 GET 请求） */
function buildUrlWithQuery(url: string, query: QueryParam[]): string {
  const parts = query.map((p) => `${p.name}=\${encodeURIComponent(params.${p.name})}`);
  return `\`${url}?${parts.join('&')}\``;
}

function emitFunction(func: ApiFunction, httpMap: HttpMethodMap): string {
  const { name, method, url, params, returnType, summary } = func;
  const hasQuery = params.query.length > 0;
  const hasBody = params.body !== null;

  // 函数签名
  const sigParts: string[] = [];
  if (hasQuery) sigParts.push(emitQueryParamsType(params.query));
  if (hasBody) sigParts.push(`data: ${params.body!.type}`);
  for (const p of params.path) sigParts.push(`${p.name}: ${p.type}`);
  const signature = sigParts.length > 0 ? sigParts.join(', ') : '';

  const retType = returnType === 'void' ? 'void' : returnType;

  // HTTP 方法名
  let httpMethod: string;
  if (method === 'GET' || method === 'DELETE') {
    httpMethod = httpMap.simple[method];
  } else {
    httpMethod = hasBody ? httpMap.withBody[method] : httpMap.simple[method];
  }

  // 函数调用参数
  const urlStr = buildUrlString(url, params.path);
  let callArgs: string;
  if (method === 'GET' || method === 'DELETE') {
    callArgs = hasQuery ? `${urlStr}, params` : urlStr;
  } else if (hasBody && hasQuery) {
    callArgs = `${buildUrlWithQuery(url, params.query)}, data`;
  } else if (hasBody) {
    callArgs = `${urlStr}, data`;
  } else if (hasQuery) {
    callArgs = `${urlStr}, params`;
  } else {
    callArgs = `${urlStr}, undefined`;
  }

  let result = '';
  if (summary) result += `/** ${summary} */\n`;
  result += `export function ${name}(${signature}): Promise<${retType}> {\n`;
  result += `  return http.${httpMethod}<${retType}>(${callArgs});\n`;
  result += '}';
  return result;
}

function emitService(
  dir: string,
  modName: string,
  funcs: ApiFunction[],
  runtimeImport: string,
  httpMap: HttpMethodMap,
): void {
  const allImports = new Set<string>();
  for (const f of funcs) for (const i of f.imports) allImports.add(i);

  let content = HEADER;
  content += `import { http } from '${runtimeImport}';\n`;
  if (allImports.size > 0) {
    const list = [...allImports].sort().map((i) => `  ${i}`).join(',\n');
    content += `import type {\n${list}\n} from '../models';\n`;
  }
  content += '\n';
  for (const f of funcs) {
    content += emitFunction(f, httpMap);
    content += '\n\n';
  }
  fs.writeFileSync(path.join(dir, `${modName}.ts`), content);
}

/** 顶层 index.ts：处理跨模块函数名冲突 */
function emitIndex(dir: string, modules: Map<string, Module>): void {
  const fnToMods = new Map<string, string[]>();
  for (const [mod, m] of modules) {
    for (const f of m.functions) {
      const list = fnToMods.get(f.name);
      if (list) list.push(mod);
      else fnToMods.set(f.name, [mod]);
    }
  }
  const conflicted = new Set<string>();
  for (const [fn, mods] of fnToMods) if (mods.length > 1) conflicted.add(fn);

  let content = HEADER;
  content += `export * from './models';\n`;
  const sortedMods = [...modules.keys()].sort();
  for (const mod of sortedMods) {
    const m = modules.get(mod)!;
    const hasConflict = m.functions.some((f) => conflicted.has(f.name));
    if (!hasConflict) {
      content += `export * from './services/${mod}';\n`;
      continue;
    }
    for (const f of m.functions) {
      if (conflicted.has(f.name)) {
        const aliased = `${mod}${f.name.charAt(0).toUpperCase()}${f.name.slice(1)}`;
        content += `export { ${f.name} as ${aliased} } from './services/${mod}';\n`;
      } else {
        content += `export { ${f.name} } from './services/${mod}';\n`;
      }
    }
  }
  fs.writeFileSync(path.join(dir, 'index.ts'), content);
}

/** 写入默认 runtime 模板（如不存在） */
function emitRuntimeTemplate(dir: string): void {
  const target = path.join(dir, 'runtime.ts');
  if (fs.existsSync(target)) {
    console.log(`  \u23ED\uFE0F  runtime.ts 已存在，跳过写入（保留你的自定义）`);
    return;
  }
  fs.writeFileSync(target, RUNTIME_TEMPLATE);
  console.log(`  \u2705 runtime.ts (默认模板，请按需替换)`);
}

/**
 * 主生成函数
 * @param result parse() 的输出
 * @param config 生成配置
 */
export function emit(result: ParseResult, config: GenerateConfig): void {
  const outputDir = path.resolve(process.cwd(), config.output);
  const modelsDir = path.join(outputDir, 'models');
  const servicesDir = path.join(outputDir, 'services');
  const runtimeImport = config.runtimeImport ?? '../runtime';
  const httpMap = config.httpMethodMap ?? DEFAULT_HTTP_METHOD_MAP;
  const emitRuntime = config.emitRuntimeTemplate ?? true;

  // 清空 models / services（保留 runtime.ts 不动，便于自定义不被覆盖）
  fs.rmSync(modelsDir, { recursive: true, force: true });
  fs.rmSync(servicesDir, { recursive: true, force: true });
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.mkdirSync(servicesDir, { recursive: true });

  if (emitRuntime) emitRuntimeTemplate(outputDir);

  // models
  emitPageVO(modelsDir);
  console.log(`  \u2705 models/PageVO.ts`);
  for (const [name, model] of result.models) {
    emitModel(modelsDir, model);
    console.log(`  \u2705 models/${name}.ts`);
  }
  emitModelsIndex(modelsDir, result.models);
  console.log(`  \u2705 models/index.ts`);

  // services
  for (const [modName, m] of result.modules) {
    emitService(servicesDir, modName, m.functions, runtimeImport, httpMap);
    console.log(`  \u2705 services/${modName}.ts (${m.functions.length} 个接口)`);
  }

  // 顶层入口
  emitIndex(outputDir, result.modules);
  console.log(`  \u2705 index.ts`);
}
