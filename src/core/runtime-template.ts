/**
 * 默认 runtime.ts 模板
 *
 * 仅依赖浏览器 / Node 内置 fetch，开箱即用。
 * 业务方可自行改写（注入 axios、添加鉴权、统一错误处理等）。
 */

export const RUNTIME_TEMPLATE = `/* eslint-disable */
/* prettier-ignore */
// 默认 runtime 模板 — 由 @zhouyuejin1995/swagger-to-api 生成。
// 你可以安全编辑此文件；下一次生成不会覆盖你已修改的内容（除非删除该文件）。
//
// 要求：导出一个名为 \`http\` 的对象，包含以下方法（按需）：
//   get<T>(url, params?): Promise<T>
//   post<T>(url, data?): Promise<T>          // x-www-form-urlencoded
//   postJson<T>(url, data?): Promise<T>      // application/json
//
// 多数项目会把这里的 http 替换成统一的 axios 封装，但保留这个最小可用版本作为起点。

export interface ApiError extends Error {
  status?: number;
  body?: unknown;
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const contentType = res.headers.get('content-type') ?? '';
  const body: unknown = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text();
  if (!res.ok) {
    const err: ApiError = new Error(\`HTTP \${res.status} \${res.statusText}\`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

export const http = {
  get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    if (!params) return request<T>(url, { method: 'GET' });
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      qs.append(k, String(v));
    }
    const sep = url.includes('?') ? '&' : '?';
    return request<T>(\`\${url}\${sep}\${qs.toString()}\`, { method: 'GET' });
  },

  post<T>(url: string, data?: Record<string, unknown>): Promise<T> {
    return request<T>(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: data ? new URLSearchParams(data as Record<string, string>).toString() : undefined,
    });
  },

  postJson<T>(url: string, data?: unknown): Promise<T> {
    return request<T>(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  },
};
`;
