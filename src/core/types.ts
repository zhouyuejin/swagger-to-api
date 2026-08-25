/**
 * Swagger 2.0 文档结构 + 解析中间数据结构
 */

export interface SwaggerDoc {
  swagger?: string;
  openapi?: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, PathItem>;
  definitions?: Record<string, Definition>;
}

export interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  delete?: Operation;
  patch?: Operation;
  options?: Operation;
  head?: Operation;
}

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  consumes?: string[];
  produces?: string[];
  parameters?: Parameter[];
  responses: Record<string, Response>;
  tags?: string[];
}

export type ParamIn = 'query' | 'body' | 'path' | 'header' | 'formData';

export interface Parameter {
  name: string;
  in: ParamIn;
  description?: string;
  required?: boolean;
  type?: string;
  schema?: Schema;
}

export interface Response {
  description: string;
  schema?: Schema;
}

export interface Definition {
  type?: string;
  description?: string;
  properties?: Record<string, Schema>;
}

export interface Schema {
  type?: string;
  format?: string;
  description?: string;
  $ref?: string;
  items?: Schema;
  properties?: Record<string, Schema>;
  enum?: string[];
}

/** 解析后的 Model（DTO） */
export interface Model {
  name: string;
  description: string;
  properties: ModelProperty[];
  imports: Set<string>;
}

export interface ModelProperty {
  name: string;
  type: string;
  description: string;
  imports: Set<string>;
}

/** 解析后的 Module（接口集合） */
export interface Module {
  name: string;
  functions: ApiFunction[];
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiFunction {
  name: string;
  method: HttpMethod;
  url: string;
  params: FunctionParams;
  returnType: string;
  summary: string;
  consumes: string[];
  imports: Set<string>;
}

export interface FunctionParams {
  query: QueryParam[];
  body: BodyParam | null;
  path: PathParam[];
  imports: Set<string>;
}

export interface QueryParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface BodyParam {
  name: string;
  type: string;
  description: string;
}

export interface PathParam {
  name: string;
  type: string;
}

/** 解析结果 */
export interface ParseResult {
  models: Map<string, Model>;
  modules: Map<string, Module>;
}

/** CLI / 程序化调用配置 */
export interface GenerateConfig {
  /** Swagger 文档：URL 或本地文件 */
  input: string;
  /** 输出目录 */
  output: string;
  /** 中文名 → 英文名 映射 */
  nameMap?: Record<string, string>;
  /** HTTP 客户端在 runtime 中暴露的方法名到默认 http 方法的映射 */
  httpMethodMap?: HttpMethodMap;
  /** runtime 导入路径（相对 services/），默认 '../runtime' */
  runtimeImport?: string;
  /** 同时写入一份默认 runtime.ts 模板到 outputDir/，默认 true */
  emitRuntimeTemplate?: boolean;
}

/** 内部 HTTP 方法名映射：
 *  GET/DELETE → 'get'；POST/PUT/PATCH 且有 body → 'postJson'；否则 'post'。
 *  此结构允许调用方完全自定义。 */
export interface HttpMethodMap {
  /** 简单参数（仅 query / 无参）的请求方法名，默认 'get' / 'post' */
  simple: { GET: string; DELETE: string; POST: string; PUT: string; PATCH: string };
  /** 带 body 时的请求方法名，默认 'postJson' / 'putJson' / 'patchJson' */
  withBody: { POST: string; PUT: string; PATCH: string };
}
