import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CLI = path.resolve(__dirname, '..', 'dist', 'cli', 'index.js');

describe('CLI --check 模式', () => {
  it('--help 包含 --check 选项', () => {
    const out = execFileSync('node', [CLI, '--help'], { encoding: 'utf8' });
    expect(out).toMatch(/--check/);
  });

  it('--check 在输出与现有文件一致时 exit 0', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cli-check-ok-'));
    // 准备 fixture + config
    const fixture = path.join(dir, 'swagger.json');
    writeFileSync(fixture, JSON.stringify({
      swagger: '2.0',
      info: { title: 't', version: '1' },
        paths: {},
        definitions: { X: { type: 'object', properties: { id: { type: 'string' } } } },
      }));
    const cfg = path.join(dir, 'cfg.yaml');
    writeFileSync(cfg, `input: ${fixture}\noutput: ${dir}/out\n`);

    // 第一次跑（生成）
    execFileSync('node', [CLI, '--config', cfg]);
    expect(existsSync(path.join(dir, 'out'))).toBe(true);

    // 第二次跑 --check，应当应 exit 0
    const result = execFileSync('node', [CLI, '--check', '--config', cfg], { encoding: 'utf8' });
    expect(result).toMatch(/--check 通过/);

    rmSync(dir, { recursive: true, force: true });
  });

  it('--check 在输出会变化时 exit 1', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cli-check-fail-'));
    const fixture = path.join(dir, 'swagger.json');
    writeFileSync(fixture, JSON.stringify({
      swagger: '2.0',
      info: { title: 't', version: '1' },
        paths: {},
        definitions: { X: { type: 'object', properties: { id: { type: 'string' } } } },
      }));
    const cfg = path.join(dir, 'cfg.yaml');
    writeFileSync(cfg, `input: ${fixture}\noutput: ${dir}/out\n`);
    execFileSync('node', [CLI, '--config', cfg]);

    // 删一个文件模拟「生成器会多生成」的场景
    // （或改一个文件模拟「生成器会重写」）
    const modelsIdx = path.join(dir, 'out', 'models', 'index.ts');
    const original = readFileSync(modelsIdx, 'utf8');
    writeFileSync(modelsIdx, original + '\n// tampered\n');

    let exitCode = 0;
    let stdout = '';
    try {
      stdout = execFileSync('node', [CLI, '--check', '--config', cfg], { encoding: 'utf8' });
    } catch (e: any) {
      exitCode = e.status ?? 1;
      stdout = e.stdout?.toString() ?? '';
    }
    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/--check 失败/);
    expect(stdout).toMatch(/models\/index\.ts/);

    rmSync(dir, { recursive: true, force: true });
  });
});
