/**
 * Swagger → 中间数据结构（models + modules）
 *
 * 关键点：
 *   - 解开统一响应体 "响应结果«X»" → 实际返回类型 X
 *   - 识别分页容器 "PageVO«X»" / "通用分页响应VO«X»" → 还原成 TypeScript 泛型 PageVO<X>
 *   - 即使响应是 响应结果«PageVO«X»»，也展开 data 中的 list.items 还原成 PageVO<X>
 *   - 收集每个 model / 每个函数依赖的 import
 *   - 命名策略通过参数注入
 *   - 循环引用防护：跟踪正在解析的 $ref 链，命中即返回类型名本身
 *   - 必填字段：从 definitions.required 数组读取
 *   - enum：顶层 enum 定义 → type alias；内联 enum → 字面量联合
 *   - format：date-time / date / int64 走 JSDoc 提示；binary 映射成 Blob
 */
import type {
  ApiFunction, Definition, FunctionParams, Model, Parameter, ParseResult, QueryParam, Schema, SwaggerDoc,
} from './types.js';
import type { NamingStrategy } from './naming.js';
import { PinyinNamingStrategy, resolveConflicts } from './naming.js';

const PAGE_VO_PREFIXES = ['PageVO\u00AB', '通用分页响应VO\u00AB'];

function extractPageVoInnerRef(refName: string): string | null {
  const stripped = refName.replace(/_\d+$/, '');
  for (const prefix of PAGE_VO_PREFIXES) {
    if (stripped.startsWith(prefix) && stripped.endsWith('\u00BB')) {
      return stripped.slice(prefix.length, -1);
    }
  }
  return null;
}

/** 基础类型映射（无 format 时） */
const BASE_TYPE_MAP: Record<string, string> = {
  string: 'string', integer: 'number', number: 'number', boolean: 'boolean',
};

/** format → TS 类型映射（仅当默认类型不合适时返回不同值；否则返回 null 保留默认） */
const FORMAT_TYPE_MAP: Record<string, string> = {
  binary: 'Blob',        // 文件上传
  // 其他格式保持原类型（string/number），仅通过 JSDoc 提示
};

/** format → JSDoc 提示 */
const FORMAT_DOC_MAP: Record<string, string> = {
  'date-time': 'ISO 8601 时间字符串 (date-time)',
  date: '日期字符串 (YYYY-MM-DD)',
  int64: '64位整数，JavaScript 中超过 2^53 会丢精度，考虑用 string 传输',
  byte: 'base64 编码字符串 (byte)',
  email: '邮箱字符串',
  uuid: 'UUID 字符串',
  uri: 'URI 字符串',
  'uri-reference': 'URI 引用字符串',
  hostname: '主机名',
  ipv4: 'IPv4 地址',
  ipv6: 'IPv6 地址',
  password: '敏感字段，不应记录日志',
};

interface TypeResolution { typeStr: string; imports: Set<string> }

/** 递归解析 schema → TS 类型 + import 集合 */
function resolveType(
  schema: Schema | undefined,
  defs: Record<string, Definition>,
  naming: NamingStrategy,
  seenRefs: Set<string> = new Set(),
): TypeResolution {
  if (!schema) return { typeStr: 'any', imports: new Set() };

  if (schema.$ref) {
    const refName = schema.$ref.replace('#/definitions/', '');

    if (seenRefs.has(refName)) {
      const engName = naming.modelName(refName);
      return { typeStr: engName, imports: new Set([engName]) };
    }

    if (extractPageVoInnerRef(refName) !== null) {
      const innerItems = defs[refName]?.properties?.list?.items;
      if (innerItems) {
        const inner = resolveType(innerItems, defs, naming, seenRefs);
        return { typeStr: `PageVO<${inner.typeStr}>`, imports: new Set([...inner.imports, 'PageVO']) };
      }
      return { typeStr: 'PageVO<any>', imports: new Set(['PageVO']) };
    }
    if (refName.startsWith('响应结果')) {
      return { typeStr: 'any', imports: new Set() };
    }
    const engName = naming.modelName(refName);
    return { typeStr: engName, imports: new Set([engName]) };
  }

  if (schema.type === 'array') {
    const inner = resolveType(schema.items ?? { type: 'object' }, defs, naming, seenRefs);
    return { typeStr: `${inner.typeStr}[]`, imports: inner.imports };
  }

  // 内联对象（含 inline enum）
  if (schema.type === 'object' && schema.properties) {
    const imports = new Set<string>();
    const props = Object.entries(schema.properties)
      .map(([k, v]) => {
        const inner = resolveType(v, defs, naming, seenRefs);
        inner.imports.forEach((i) => imports.add(i));
        const desc = v.description ? `/** ${v.description} */ ` : '';
        return `${desc}${k}: ${inner.typeStr}`;
      })
      .join('; ');
    return { typeStr: `{ ${props} }`, imports };
  }

  if (schema.type === 'object') {
    return { typeStr: 'Record<string, any>', imports: new Set() };
  }

  // 基础类型（含 format）
  let baseType = BASE_TYPE_MAP[schema.type ?? ''] || 'any';
  if (schema.format && FORMAT_TYPE_MAP[schema.format]) {
    baseType = FORMAT_TYPE_MAP[schema.format];
  }

  // inline enum（schema.type + schema.enum 同级）
  if (schema.enum && schema.enum.length > 0) {
    const literals = schema.enum.map((v) => (typeof v === 'string' ? `'${v}'` : String(v))).join(' | ');
    return { typeStr: literals, imports: new Set() };
  }

  return { typeStr: baseType, imports: new Set() };
}

/** 决定属性的可空性 + JSDoc 描述（含 format 提示） */
function buildPropDescription(schema: Schema): string {
  const parts: string[] = [];
  if (schema.description) parts.push(schema.description);
  if (schema.format && FORMAT_DOC_MAP[schema.format]) {
    parts.push(FORMAT_DOC_MAP[schema.format]);
  } else if (schema.format) {
    parts.push(`format: ${schema.format}`);
  }
  return parts.join(' / ');
}

function parseProperties(
  props: Record<string, Schema> | undefined,
  required: string[] | undefined,
  defs: Record<string, Definition>,
  naming: NamingStrategy,
  parentRefName: string,
) {
  if (!props) return [];
  const seenRefs = new Set<string>([parentRefName]);
  return Object.entries(props).map(([key, schema]) => {
    const { typeStr, imports } = resolveType(schema, defs, naming, seenRefs);
    return {
      name: key,
      type: typeStr,
      description: buildPropDescription(schema),
      required: required?.includes(key) ?? false,
      imports,
    };
  });
}

/** 解包「响应结果»X»」的 data 字段 */
function unwrapResponse(
  def: Definition | undefined,
  defs: Record<string, Definition>,
  naming: NamingStrategy,
  seenRefs: Set<string> = new Set(),
): TypeResolution {
  const dataProp = def?.properties?.data;
  if (!dataProp) return { typeStr: 'void', imports: new Set() };
  return resolveType(dataProp, defs, naming, seenRefs);
}

function parseParams(
  parameters: Parameter[] | undefined,
  defs: Record<string, Definition>,
  naming: NamingStrategy,
): FunctionParams {
  if (!parameters || !parameters.length) {
    return { query: [], body: null, path: [], imports: new Set() };
  }
  const query: QueryParam[] = [];
  let body: FunctionParams['body'] = null;
  const path: FunctionParams['path'] = [];
  const imports = new Set<string>();

  for (const param of parameters) {
    if (param.in === 'query') {
      const { typeStr, imports: imps } = resolveType(param, defs, naming);
      imps.forEach((i) => imports.add(i));
      query.push({ name: param.name, type: typeStr, description: buildPropDescription(param), required: param.required || false });
    } else if (param.in === 'body') {
      const { typeStr, imports: imps } = resolveType(param.schema ?? param, defs, naming);
      imps.forEach((i) => imports.add(i));
      body = { name: param.name || 'data', type: typeStr, description: param.description || '' };
    } else if (param.in === 'path') {
      const { typeStr } = resolveType(param, defs, naming);
      path.push({ name: param.name, type: typeStr });
    }
  }
  return { query, body, path, imports };
}

function resolveReturnType(
  op: { responses: Record<string, { schema?: Schema }> },
  defs: Record<string, Definition>,
  naming: NamingStrategy,
): TypeResolution {
  const schema200 = op.responses['200']?.schema ?? op.responses[200]?.schema;
  if (!schema200) return { typeStr: 'void', imports: new Set() };
  if (schema200.$ref) {
    const refName = schema200.$ref.replace('#/definitions/', '');

    if (refName.startsWith('响应结果')) {
      const dataProp = defs[refName]?.properties?.data;
      if (dataProp?.type === 'object' && dataProp.properties?.list?.items) {
        const inner = resolveType(dataProp.properties.list.items, defs, naming);
        return { typeStr: `PageVO<${inner.typeStr}>`, imports: new Set([...inner.imports, 'PageVO']) };
      }
      return unwrapResponse(defs[refName], defs, naming);
    }

    if (extractPageVoInnerRef(refName) !== null) {
      const innerItems = defs[refName]?.properties?.list?.items;
      if (innerItems) {
        const inner = resolveType(innerItems, defs, naming);
        return { typeStr: `PageVO<${inner.typeStr}>`, imports: new Set([...inner.imports, 'PageVO']) };
      }
      return { typeStr: 'PageVO<any>', imports: new Set(['PageVO']) };
    }

    return unwrapResponse(defs[refName], defs, naming);
  }
  return resolveType(schema200, defs, naming);
}

/** 主解析函数 */
export function parse(swagger: SwaggerDoc, naming?: NamingStrategy): ParseResult {
  const strategy = naming ?? new PinyinNamingStrategy();
  const defs = swagger.definitions ?? {};
  const paths = swagger.paths ?? {};

  const models = new Map<string, Model>();
  for (const [name, def] of Object.entries(defs)) {
    if (name.startsWith('响应结果')) continue;
    if (extractPageVoInnerRef(name) !== null) continue;

    const engName = strategy.modelName(name);

    // 顶层 enum 定义（独立 type alias）
    if (def.enum && def.enum.length > 0) {
      models.set(engName, {
        name: engName,
        description: def.description || '',
        properties: [],
        imports: new Set(),
        enum: def.enum,
      });
      continue;
    }

    const props = parseProperties(def.properties, def.required, defs, strategy, name);
    const allImports = new Set<string>();
    for (const p of props) p.imports.forEach((i) => allImports.add(i));

    models.set(engName, {
      name: engName,
      description: def.description || '',
      properties: props,
      imports: allImports,
    });
  }

  const modules = new Map<string, ApiFunction[]>();
  for (const [urlPath, methods] of Object.entries(paths)) {
    const mod = strategy.moduleName(urlPath);
    if (!modules.has(mod)) modules.set(mod, []);

    for (const [method, op] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;

      const fnName = strategy.functionName(op.operationId || '');
      const params = parseParams(op.parameters, defs, strategy);
      const returnType = resolveReturnType(op, defs, strategy);
      const consumes = op.consumes || [];

      const allImports = new Set<string>([...params.imports, ...returnType.imports]);
      modules.get(mod)!.push({
        name: fnName,
        method: method.toUpperCase() as ApiFunction['method'],
        url: urlPath,
        params,
        returnType: returnType.typeStr,
        summary: op.summary || '',
        consumes,
        imports: allImports,
      });
    }
  }

  for (const [, funcs] of modules) resolveConflicts(funcs);

  const result: ParseResult = { models, modules: new Map() };
  for (const [name, funcs] of modules) {
    result.modules.set(name, { name, functions: funcs });
  }
  return result;
}
