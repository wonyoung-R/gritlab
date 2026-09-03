/**
 * 드리프트 방지 — 빌더(public/tournament.html)의 stdFormat과
 * 모듈(src/lib/format-routing.js)의 routeFormat이 같은 결과를 내야 한다.
 *
 * 정적 HTML은 src/ 모듈을 import할 수 없어 규칙이 두 벌로 존재한다(기획 §1-F A안).
 * 한쪽만 고치면 이 테스트가 잡는다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeFormat, MIN_TEAMS, MAX_TEAMS } from '../src/lib/format-routing.js';

const html = readFileSync(new URL('../public/tournament.html', import.meta.url), 'utf8');
const snippet = html.match(/const STD_MIN_TEAMS[\s\S]*?\n\}\n/);

test('빌더에 stdFormat이 존재한다', () => {
    assert.ok(snippet, 'public/tournament.html에서 stdFormat을 찾지 못했습니다');
});

test('빌더 stdFormat과 모듈 routeFormat이 7~18팀 전 구간에서 일치한다', () => {
    const stdFormat = new Function(`${snippet[0]}; return stdFormat;`)();
    for (let n = MIN_TEAMS; n <= MAX_TEAMS; n++) {
        const a = routeFormat(n), b = stdFormat(n);
        assert.deepEqual(b.groups, a.groups, `${n}팀 조 구성`);
        assert.equal(b.groupCount, a.groupCount, `${n}팀 조 수`);
        assert.equal(b.playoff, a.playoff, `${n}팀 플레이오프`);
        assert.equal(b.wildcards, a.wildcards, `${n}팀 와일드카드`);
        assert.equal(b.gamesPerTeam, a.gamesPerTeam, `${n}팀 팀당 경기`);
        assert.equal(b.groupGames, a.groupGames, `${n}팀 예선 경기`);
        assert.equal(b.playoffGames, a.playoffGames, `${n}팀 본선 경기`);
    }
});

test('표준 범위 밖은 양쪽 모두 null', () => {
    const stdFormat = new Function(`${snippet[0]}; return stdFormat;`)();
    for (const n of [4, 6, 19, 32]) {
        assert.equal(routeFormat(n), null, `모듈 ${n}팀`);
        assert.equal(stdFormat(n), null, `빌더 ${n}팀`);
    }
});
