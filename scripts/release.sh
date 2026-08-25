#!/usr/bin/env bash
# 发布脚本：测试 → 构建 → 改版本 → commit → tag → push → 等 Actions
#
# 用法：
#   ./scripts/release.sh patch         # 0.1.1 → 0.1.2
#   ./scripts/release.sh minor         # 0.1.1 → 0.2.0
#   ./scripts/release.sh major         # 0.1.1 → 1.0.0
#   ./scripts/release.sh 0.2.5         # 显式版本号
#   ./scripts/release.sh patch --dry   # 只跑测试+构建，不改版本不 push

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=false
for arg in "$@"; do
  if [ "$arg" = "--dry" ] || [ "$arg" = "--dry-run" ]; then
    DRY_RUN=true
  fi
done

# ---------- 1. 预检 ----------
echo -e "${BLUE}▶ 预检${NC}"

if [[ -n "$(git status --porcelain)" ]]; then
  echo -e "${RED}❌ 工作区不干净，先 commit 或 stash${NC}"
  git status --short
  exit 1
fi
echo "  ✓ 工作区干净"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "main" && "$CURRENT_BRANCH" != "master" ]]; then
  echo -e "${YELLOW}⚠ 当前分支: $CURRENT_BRANCH（不是 main）${NC}"
  read -rp "继续? [y/N] " -n 1
  echo
  [[ $REPLY =~ ^[Yy]$ ]] || { echo "已取消"; exit 1; }
fi

if ! command -v jq > /dev/null 2>&1; then
  # 退化方案：用 node 读 package.json
  PKG_NAME=$(node -e "console.log(require('./package.json').name)")
  CURRENT=$(node -e "console.log(require('./package.json').version)")
else
  PKG_NAME=$(jq -r .name package.json)
  CURRENT=$(jq -r .version package.json)
fi
echo "  ✓ 包名: $PKG_NAME"
echo "  ✓ 当前版本: $CURRENT"

# ---------- 2. 解析新版本 ----------
if [ $# -eq 0 ]; then
  echo "用法: $0 {patch|minor|major|<x.y.z>} [--dry]"
  exit 1
fi

BUMP_ARG=""
for arg in "$@"; do
  case "$arg" in
    --dry|--dry-run) ;;
    *) BUMP_ARG="$arg" ;;
  esac
done

if [[ "$BUMP_ARG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$BUMP_ARG"
elif [[ "$BUMP_ARG" == "patch" || "$BUMP_ARG" == "minor" || "$BUMP_ARG" == "major" ]]; then
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  case "$BUMP_ARG" in
    patch) PATCH=$((PATCH + 1)) ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  esac
  NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
else
  echo -e "${RED}❌ 无效参数: $BUMP_ARG${NC}"
  echo "用法: $0 {patch|minor|major|<x.y.z>} [--dry]"
  exit 1
fi

echo -e "${BLUE}▶ 版本计划${NC}"
echo "  $CURRENT  →  $NEW_VERSION"

# ---------- 3. 变更日志 ----------
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  echo -e "${BLUE}▶ 本次变更（${LAST_TAG}..HEAD）${NC}"
  git log --oneline "${LAST_TAG}..HEAD" || true
  echo
fi

# ---------- 4. 确认 ----------
if $DRY_RUN; then
  echo -e "${YELLOW}DRY RUN：只跑测试+构建，不改版本不 push${NC}"
else
  read -rp "发布 v${NEW_VERSION}? [y/N] " -n 1
  echo
  [[ $REPLY =~ ^[Yy]$ ]] || { echo "已取消"; exit 0; }
fi

# ---------- 5. lint + test + build ----------
echo -e "${BLUE}▶ lint + test + build${NC}"
npm run lint
npm test
npm run build
echo -e "${GREEN}  ✓ 通过${NC}"

if $DRY_RUN; then
  echo -e "${YELLOW}DRY RUN 完成，未做版本变更${NC}"
  exit 0
fi

# ---------- 6. 改版本号 ----------
echo -e "${BLUE}▶ 更新 package.json 版本${NC}"
if command -v jq > /dev/null 2>&1; then
  jq --arg v "$NEW_VERSION" '.version = $v' package.json > package.json.tmp
  mv package.json.tmp package.json
else
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    p.version = '$NEW_VERSION';
    fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
  "
fi
echo "  ✓ → $NEW_VERSION"

# ---------- 7. commit + tag ----------
git add package.json
git commit -m "chore: release v${NEW_VERSION}"
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"

# ---------- 8. 推送 ----------
echo -e "${BLUE}▶ 推送${NC}"
git push origin "$CURRENT_BRANCH"
git push origin "v${NEW_VERSION}"

# ---------- 9. 等 Actions ----------
echo -e "${BLUE}▶ 触发 GitHub Actions${NC}"
REPO_URL=$(git config --get remote.origin.url | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
echo "  Actions: https://github.com/${REPO_URL}/actions"

sleep 8
RUN_ID=$(curl -s --max-time 15 "https://api.github.com/repos/${REPO_URL}/actions/runs?per_page=1" 2>/dev/null \
  | node -e "
let s = '';
process.stdin.on('data', c => s += c);
process.stdin.on('end', () => {
  try {
    const d = JSON.parse(s);
    const runs = d.workflow_runs || [];
    if (runs[0]) console.log(runs[0].id);
  } catch (e) {}
});" 2>/dev/null || true)

if [ -n "${RUN_ID:-}" ]; then
  echo "  Run: https://github.com/${REPO_URL}/actions/runs/${RUN_ID}"
  echo -e "${YELLOW}  等几分钟后访问: https://www.npmjs.com/package/${PKG_NAME}${NC}"
fi

echo -e "${GREEN}✓ 发布流程已启动${NC}"
