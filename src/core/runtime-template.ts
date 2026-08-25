/**
 * 默认 runtime.ts 模板
 *
 * 安全特性（v0.2.0）：
 *   - 默认 30 秒超时（AbortSignal.timeout），可通过传 signal 覆盖
 *   - 结构化 ApiError：包含 status / body / url 便于业务方捕获
 *   - 网络错误 / HTTP 错误 / JSON 解析错误三类异常都能正确抛出
 *
 * 业务方可整文件替换（默认不会被生成器覆盖）。
 */

export const RUNTIME_TEMPLATE = `/* eslint-disable */
/* prettier-ignore */
// 默认 runtime 模板 — 由 @zhouyuejin1995/swagger-to-api 生成。
// 你可以安全编辑此文件；下一次生成不会覆盖你已修改的内容（除非删除该文件）。
//
// 要求：导出一个名为 \`http\` 的对象，包含以下方法：
//   get<T>(url, params?, options?): Promise<T>
//   post<T>(url, data?, options?): Promise<T>          // x-www-form-urlencoded
//   postJson<T>(url, data?, options?): Promise<T>      // application/json
//
// \`options.signal\` 可传入 AbortSignal 取消请求；不传则默认 30 秒超时。

export interface ApiError extends Error {
  status?: number;
  body?: unknown;
  url?: string;
}

/** HTTP 客户端选项（用于取消请求、超时控制等） */
export interface HttpOptions {
  signal?: AbortSignal;
}

/** 默认超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 30_000;

async function request<T>(url: string, init: RequestInit & { signal?: AbortSignal }): Promise<T> {
  // 超时控制：如果调用方没传 signal，就用 AbortSignal.timeout 包一层
  const signal = init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal });
  } catch (err) {
    // 网络层错误（DNS / TLS / 连接重置 / 超时）
    const e: ApiError = new Error(
      err instanceof Error ? \`网络错误: \${err.message}\` : '网络错误'
    );
    e.url = url;
    throw e;
  }

  const contentType = res.headers.get('content-type') ?? '';
  let body: unknown;
  try {
    body = contentType.includes('application/json')
      ? await res.json()
      : await res.text();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const e: ApiError = new Error(\`HTTP \${res.status} \${res.statusText}\`);
    e.status = res.status;
    e.body = body;
    e.url = url;
    throw e;
  }
  return body as T;
}

function buildUrl(url: string, params?: Record<string, unknown>): string {
  if (!params) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    qs.append(k, String(v));
  }
  const sep = url.includes('?') ? '&' : '?';
  return \`\${url}\${sep}\${qs.toString()}\`;
}

export const http = {
  get<T>(url: string, params?: Record<string, unknown>, options?: HttpOptions): Promise<T> {
    return request<T>(buildUrl(url, params), { method: 'GET', signal: options?.signal });
  },

  post<T>(url: string, data?: Record<string, unknown>, options?: HttpOptions): Promise<T> {
    return request<T>(url, {
      method: 'POST',
      signal: options?.signal,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: data ? new URLSearchParams(data as Record<string, string>).toString() : undefined,
    });
  },

  postJson<T>(url: string, data?: unknown, options?: HttpOptions): Promise<T> {
    return request<T>(url, {
      method: 'POST',
      signal: options?.signal,
      headers: { 'content-type': 'application/json' },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  },
};
`;
