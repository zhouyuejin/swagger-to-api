/**
 * Swagger 文档加载器
 * - http(s) 地址 → 用 Node 内置 fetch 拉取文本
 * - 本地路径 → 读取 JSON 文件
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SwaggerDoc } from './types.js';

export async function loadSwagger(input: string): Promise<SwaggerDoc> {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    console.log(`\u{1F4E5} 下载 swagger 文档: ${input}`);
    const res = await fetch(input);
    if (!res.ok) {
      throw new Error(`下载 swagger 文档失败，HTTP 状态码: ${res.status}`);
    }
    const raw = await res.text();
    if (!raw.trim()) {
      throw new Error('下载的 swagger 文档为空');
    }
    return JSON.parse(raw) as SwaggerDoc;
  }
  const resolved = path.resolve(process.cwd(), input);
  console.log(`\u{1F4C4} 读取本地 swagger 文档: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8')) as SwaggerDoc;
}
