/**
 * OpenAPI 3.x → 内部 Swagger 2.0 形态 转换器
 *
 * 通过统一成 Swagger 2.0 形态，emitter / parser 不需要为 OAS3 单独写代码。
 *
 * 关键转换：
 *   - components.schemas → definitions
 *   - $ref: #/components/schemas/X → $ref: #/definitions/X
 *   - requestBody（application/json）→ parameters: [{ in: 'body', schema: ... }]
 *   - requestBody（multipart/form-data 等）→ parameters: [{ in: 'formData', ... }]
 *   - responses[200].content[mt].schema → responses[200].schema
 *
 * 不支持的（v0.4 范围外）：
 *   - oneOf / anyOf / allOf 组合 schema
 *   - discriminator
 *   - OAS 3.1 专属特性（type: ['x', 'null'] 等）
 *   - nullable: true（视为必有，未来加）
 */

import type {
  OpenAPIDoc, OpenAPIPathItem, OpenAPIOperation, OpenAPIResponse, MediaType, RequestBody,
  Parameter, PathItem, Operation, Schema,
} from './types.js';
import type { SwaggerDoc } from './types.js';

/** 判断是否 OpenAPI 3.x */
export function isOpenAPI3(doc: any): doc is OpenAPIDoc {
  return typeof doc?.openapi === 'string' && doc.openapi.startsWith('3.');
}

/** 把 schema 里所有 $ref 路径里的 components/schemas → definitions（递归） */
function rewriteRefs(schema: Schema | undefined): Schema | undefined {
  if (!schema) return schema;
  const out: Schema = { ...schema };
  if (typeof out.$ref === 'string') {
    out.$ref = out.$ref.replace('#/components/schemas/', '#/definitions/');
  }
  if (out.items) out.items = rewriteRefs(out.items);
  if (out.properties) {
    const newProps: Record<string, Schema> = {};
    for (const [k, v] of Object.entries(out.properties)) {
      newProps[k] = rewriteRefs(v)!;
    }
    out.properties = newProps;
  }
  return out;
}

/** OAS3 response[code].content[mt].schema → Swagger 2.0 responses[code].schema */
function normalizeResponse(res: OpenAPIResponse): { description: string; schema?: Schema } {
  const content = res.content ?? {};
  // 优先取 application/json，否则取第一个
  const media = content['application/json']
    ?? Object.values(content).find((m): m is MediaType => !!m?.schema);
  return {
    description: res.description,
    schema: media?.schema ? rewriteRefs(media.schema) : undefined,
  };
}

/** OAS3 requestBody → Swagger 2.0 parameters */
function normalizeRequestBody(rb: RequestBody | undefined): Parameter[] {
  if (!rb?.content) return [];
  const out: Parameter[] = [];
  const required = rb.required ?? false;

  for (const [mediaType, media] of Object.entries(rb.content)) {
    const schema = media?.schema;
    if (!schema) continue;

    // multipart/form-data / application/x-www-form-urlencoded：合并成单个 body schema
    // （生成的 service 调 http.postJson 即可，运行时负责 multipart 编码）
    if (mediaType.includes('form-data') || mediaType === 'application/x-www-form-urlencoded') {
      const rewritten = rewriteRefs(schema);
      out.push({
        name: 'data',
        in: 'body',
        required,
        description: rb.description ?? 'multipart/form-data',
        schema: rewritten,
      });
      continue;
    }

    // application/json（或其他）→ body 参数
    out.push({
      name: 'data',
      in: 'body',
      required,
      description: rb.description,
      schema: rewriteRefs(schema),
    });
  }
  return out;
}

/** OAS3 operation → Swagger 2.0 operation */
function normalizeOperation(op: OpenAPIOperation): Operation {
  const params: Parameter[] = (op.parameters ?? []).map((p) => {
    // OAS3 把类型放在 schema 里；把它平铺到 param 一级，让旧 parser 能直接读 type
    if (p.schema) {
      const s = rewriteRefs(p.schema)!;
      return {
        ...p,
        type: s.type ?? p.type,
        format: s.format ?? p.format,
        description: p.description ?? s.description,
        schema: s,
      };
    }
    return p;
  });
  params.push(...normalizeRequestBody(op.requestBody));

  const responses: Record<string, { description: string; schema?: Schema }> = {};
  for (const [code, res] of Object.entries(op.responses)) {
    responses[code] = normalizeResponse(res);
  }

  return {
    operationId: op.operationId,
    summary: op.summary,
    description: op.description,
    parameters: params,
    responses,
    tags: op.tags,
  };
}

/** OAS3 pathItem → Swagger 2.0 pathItem */
function normalizePathItem(item: OpenAPIPathItem): PathItem {
  const out: PathItem = {};
  for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
    const op = item[method];
    if (op) out[method] = normalizeOperation(op);
  }
  return out;
}

/** 主转换函数：OAS3 文档 → Swagger 2.0 形态 */
export function normalizeOpenApi3(doc: OpenAPIDoc): SwaggerDoc {
  const paths: Record<string, PathItem> = {};
  for (const [url, item] of Object.entries(doc.paths ?? {})) {
    paths[url] = normalizePathItem(item);
  }

  // components.schemas → definitions（保持原引用键名）
  const definitions: Record<string, any> = {};
  for (const [name, def] of Object.entries(doc.components?.schemas ?? {})) {
    definitions[name] = rewriteRefs(def as Schema);
  }

  return {
    swagger: '2.0',
    info: doc.info,
    paths,
    definitions,
  };
}
