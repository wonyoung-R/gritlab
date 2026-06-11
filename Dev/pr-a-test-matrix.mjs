#!/usr/bin/env node
// PR-A 머지 게이트: 예선 대진 생성 전수 테스트 매트릭스 (n=2~9 × X=2~9 + 풀리그)
// tournament.html에서 실제 알고리즘 함수를 추출해 검증 — 단일 진실 원천, DB 무접촉.
// 실행: node Dev/pr-a-test-matrix.mjs   (결과: Dev/PR-A_test_matrix.md 갱신 + exit code)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'public/tournament.html'), 'utf8');

// ── tournament.html에서 함수 본문 추출 (brace 매칭) ──
function extractFn(name) {
  const idx = src.indexOf(`function ${name}(`);
  if (idx === -1) throw new Error(`함수 미발견: ${name}`);
  let depth = 0;
  for (let j = src.indexOf('{', idx); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(idx, j + 1); }
  }
  throw new Error(`brace 불일치: ${name}`);
}
const minGamesMatch = src.match(/const MIN_GAMES = (\d+);/);
if (!minGamesMatch) throw new Error('MIN_GAMES 상수 미발견');
const code = [
  `const MIN_GAMES = ${minGamesMatch[1]};`,
  extractFn('roundRobinRounds'),
  extractFn('hamiltonianCyclesOdd'),
  extractFn('groupScheduleEx'),
  extractFn('nearestFeasibleX'),
  extractFn('groupFeasible'),
  'return { MIN_GAMES, roundRobinRounds, hamiltonianCyclesOdd, groupScheduleEx, nearestFeasibleX, groupFeasible };',
].join('\n');
const { MIN_GAMES, groupScheduleEx, nearestFeasibleX, groupFeasible } = new Function(code)();

// ── 한 조(n팀, 팀당 X경기) 검증 ──
// 기대: groupFeasible(n,X)=true → 정확 균등(전팀 X경기·중복 0·warn 없음)
//       false → 빌더가 생성 차단(scheduleFeasibility) — 대안 제안 확인
function check(n, X) {
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  const feasible = X === 0 ? n >= 3 : groupFeasible(n, X); // 풀리그는 n-1>=MIN_GAMES(=2) → n>=3
  if (!feasible) {
    const alts = X === 0 ? [] : nearestFeasibleX(n, X);
    return { mark: '🚫', detail: alts.length ? `차단+대안 ${alts.join('/')}` : '차단+팀추가 안내' };
  }
  const { pairs, warn } = groupScheduleEx(ids, X);
  const target = X === 0 ? n - 1 : X;
  const cnt = Object.fromEntries(ids.map(id => [id, 0]));
  const seen = new Set();
  for (const [a, b] of pairs) {
    if (a === b) return { mark: '❌', detail: '자기 자신과 매치' };
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (seen.has(key)) return { mark: '❌', detail: `중복 매치업 ${key}` };
    seen.add(key);
    cnt[a]++; cnt[b]++;
  }
  const bad = ids.filter(id => cnt[id] !== target);
  if (bad.length) return { mark: '❌', detail: `경기수 불일치: 팀${bad[0]}=${cnt[bad[0]]} (목표 ${target})` };
  if (X > 0 && warn) return { mark: '❌', detail: `feasible인데 warn 발생: ${warn}` };
  return { mark: '✅', detail: `${pairs.length}경기·전팀 ${target}` };
}

// ── 전수 실행: n=2~9, X=풀리그(0)·2~9 ──
const NS = [2, 3, 4, 5, 6, 7, 8, 9];
const XS = [0, 2, 3, 4, 5, 6, 7, 8, 9];
let fails = 0;
const rows = NS.map(n => {
  const cells = XS.map(X => {
    const r = check(n, X);
    if (r.mark === '❌') { fails++; console.error(`FAIL n=${n} X=${X}: ${r.detail}`); }
    return r;
  });
  return { n, cells };
});

// ── 마크다운 매트릭스 출력 ──
const today = new Date().toISOString().slice(0, 10);
let md = `# PR-A 테스트 매트릭스 — 예선 대진 생성 전수 검증

> 생성: \`node Dev/pr-a-test-matrix.mjs\` (${today}) · 대상: public/tournament.html 실코드 추출
> ✅ = 정확 균등 생성 검증 통과 (전 팀 경기수 일치 + 중복 매치업 0 + warn 없음)
> 🚫 = 실현 불가 → 생성 차단 + admin 안내 (정상 동작)
> 실현 조건: X ≤ n−1 AND (n 짝수 OR X 짝수) · 최소 X = MIN_GAMES(${MIN_GAMES}) · 풀리그는 n≥3

| n\\\\X | 풀리그 | ${XS.slice(1).join(' | ')} |
|---|---|${XS.slice(1).map(() => '---').join('|')}|
`;
for (const { n, cells } of rows) {
  md += `| **${n}팀** | ${cells.map(c => c.mark === '✅' ? `✅ ${c.detail}` : c.mark === '🚫' ? `🚫 ${c.detail}` : `❌ ${c.detail}`).join(' | ')} |\n`;
}
md += `\n**결과: ${fails === 0 ? '전수 PASS' : `${fails}건 FAIL`}** — 총 ${NS.length * XS.length}케이스\n`;

// 대표 불가 케이스 명시 (스펙 요구)
md += `\n## 대표 불가 케이스 확인
- **2팀 조 + 팀당 2경기**: ${check(2, 2).mark} — 중복 매치업 없이 불가 → 생성 차단 + "팀 추가" 안내
- **3팀 조 + 팀당 2경기**: ${check(3, 2).mark} — 해밀턴 사이클 1개로 가능
- **5팀 조 + 팀당 3경기(홀수×홀수)**: ${check(5, 3).mark} — 차단 + 짝수 대안 제안
- **풀리그 2팀 조**: ${check(2, 0).mark} — 팀당 1경기(최소 ${MIN_GAMES} 미달) → 차단
`;
writeFileSync(join(root, 'Dev/PR-A_test_matrix.md'), md);
console.log(md);
process.exit(fails === 0 ? 0 : 1);
