/**
 * --check 模式：在临时目录生成，对比目标目录，返回是否有变化
 * 用于 CI 检测「后端 swagger 改了但没重跑 generate-api」
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { emit } from '../core/emitter.js';
import type { ParseResult, GenerateConfig } from '../core/types.js';

/** diff 两个目录的文件内容，返回有差异的文件列表 */
function diffDirs(a: string, b: string): string[] {
  const filesA = new Set<string>();
  walk(a).forEach((f) => filesA.add(path.relative(a, f)));
  const changed: string[] = [];
  for (const rel of filesA) {
    const pathA = path.join(a, rel);
    const pathB = path.join(b, rel);
    if (!fs.existsSync(pathB)) {
      changed.push(rel);
      continue;
    }
    const ca = fs.readFileSync(pathA, 'utf8');
    const cb = fs.readFileSync(pathB, 'utf8');
    if (ca !== cb) changed.push(rel);
  }
  return changed;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) out.push(...walk(fp));
    else out.push(fp);
  }
  return out;
}

export interface CheckResult {
  hasDiff: boolean;
  changedFiles: string[];
  /** 临时生成目录，调用方需负责清理 */
  tempDir: string;
}

/**
 * 生成到临时目录，与 targetDir 比较；返回是否有差异
 * 不写 targetDir任何东西
 */
export async function checkOutput(
  result: ParseResult,
  config: GenerateConfig,
  targetDir: string,
): Promise<CheckResult> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swagger-to-api-check-'));
  await emit(result, { ...config, output: tempDir });
  const changed = diffDirs(tempDir, path.resolve(process.cwd(), targetDir));
  return { hasDiff: changed.length > 0, changedFiles: changed, tempDir };
}
