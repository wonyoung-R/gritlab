/**
 * 골든 테스트 — 접수팀 라우팅 · 와일드카드 · 성적순 시딩 · 조 1위 동률 보류
 * 실행: npm test   (node --test)
 *
 * 기준 문서: Dev/format-routing-plan.md
 * ⛔ 실패했을 때 기대값을 실제 출력에 맞추지 말 것 (STANDARDS 1-C: teaching-to-the-test 금지).
 *    규칙이 바뀌었다면 기획 문서를 먼저 고치고, 그 근거를 커밋 메시지에 남긴다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    routeFormat, FORMAT_TABLE, MIN_TEAMS, MAX_TEAMS, GAMES_PER_TEAM, groupCanHaveDecider,
    standingRowsFor, applyExtraGameResult, rankSeeds, pairSeeds,
    computePlayoffSeeding, WC_RULE,
} from '../src/lib/format-routing.js';

/* ── 헬퍼: 조 경기 만들기 ────────────────────────────────── */
let seq = 0;
const game = (round, a, b, sa, sb, status = 'ENDED') => ({
    id: ++seq, round, team_a_name: a, team_b_name: b,
    team_a_score: sa, team_b_score: sb, status,
    winner: status === 'ENDED' ? (sa > sb ? 'A_WIN' : 'B_WIN') : null,
    match_order: seq,
});
/** 풀리그 — results: { 'A>B': [21,10], ... } */
const roundRobin = (round, teams, results) => {
    const out = [];
    for (let i = 0; i < teams.length; i++)
        for (let j = i + 1; j < teams.length; j++) {
            const a = teams[i], b = teams[j];
            const r = results[`${a}>${b}`];
            assert.ok(r, `결과 누락: ${a}>${b}`);
            out.push(game(round, a, b, r[0], r[1]));
        }
    return out;
};

/* ══════════════════════════════════════════════════════════
   1. 라우팅 표 — 사장 확정 6행 + 전 구간 불변식
   ══════════════════════════════════════════════════════════ */

test('사장 확정 6행이 규칙에서 그대로 재현된다', () => {
    const given = {
        9: { groups: [3, 3, 3], playoff: 4, wildcards: 1 },
        10: { groups: [3, 3, 4], playoff: 4, wildcards: 1 },
        11: { groups: [3, 4, 4], playoff: 4, wildcards: 1 },
        12: { groups: [3, 3, 3, 3], playoff: 4, wildcards: 0 }, // 2026-09-03 사장 변경 (구: 4/4/4 · WC 1)
        15: { groups: [3, 3, 3, 3, 3], playoff: 8, wildcards: 3 },
        18: { groups: [3, 3, 3, 3, 3, 3], playoff: 8, wildcards: 2 },
    };
    for (const [n, want] of Object.entries(given)) {
        const got = routeFormat(Number(n));
        assert.deepEqual(got.groups, want.groups, `${n}팀 조 구성`);
        assert.equal(got.playoff, want.playoff, `${n}팀 플레이오프`);
        assert.equal(got.wildcards, want.wildcards, `${n}팀 와일드카드`);
    }
});

test('7~18 전 구간 불변식 — 조 크기 3·4만 / 합계=N / 1위+WC=플옵 / 조≤4면 4강', () => {
    for (let n = MIN_TEAMS; n <= MAX_TEAMS; n++) {
        const f = routeFormat(n);
        assert.ok(f, `${n}팀 라우팅 결과 있음`);
        assert.ok(f.groups.every(g => g === 3 || g === 4), `${n}팀: 조 크기는 3 또는 4 (R1) — ${f.groups}`);
        assert.equal(f.groups.reduce((a, b) => a + b, 0), n, `${n}팀: 조 인원 합계`);
        assert.equal(f.winners + f.wildcards, f.playoff, `${n}팀: 1위+WC = 플옵 인원 (R4)`);
        assert.equal(f.playoff, f.groupCount <= 4 ? 4 : 8, `${n}팀: 조 ≤4 → 4강 (R2)`);
        assert.ok(f.wildcards >= 0, `${n}팀: 와일드카드 음수 아님`);
    }
});

test('12~14팀은 4개 조 · 조 1위 4팀이 그대로 4강 (와일드카드 없음)', () => {
    for (const n of [12, 13, 14]) {
        const f = routeFormat(n);
        assert.equal(f.groupCount, 4, `${n}팀 조 수`);
        assert.equal(f.playoff, 4, `${n}팀 플레이오프`);
        assert.equal(f.wildcards, 0, `${n}팀: 조 1위 4팀으로 4강이 꽉 차 와일드카드 불필요`);
    }
});

test('조 수가 5개 이상이면 8강 (조 1위가 4강에 다 못 들어감)', () => {
    for (const n of [15, 16, 17, 18]) {
        const f = routeFormat(n);
        assert.ok(f.groupCount >= 5, `${n}팀 조 수`);
        assert.equal(f.playoff, 8, `${n}팀 플레이오프`);
    }
});

test('9·12·15·18팀은 전 조가 3팀 — 17팀은 3/4 혼합이 불가피하다', () => {
    for (const n of [9, 12, 15, 18]) {
        const f = routeFormat(n);
        assert.ok(f.groups.every(g => g === 3), `${n}팀: 전 조 3팀`);
    }
    // 17팀은 3·4로만 나누면 3/3/3/4/4 외 대안이 없어 혼합이 불가피 (R9)
    assert.deepEqual(routeFormat(17).groups, [3, 3, 3, 4, 4]);
});

test('모든 팀이 예선 2경기 — 4팀 조는 풀리그가 아니라 부분 리그 (R10)', () => {
    assert.equal(GAMES_PER_TEAM, 2);
    for (let n = MIN_TEAMS; n <= MAX_TEAMS; n++) {
        const f = routeFormat(n);
        assert.equal(f.gamesPerTeam, 2, `${n}팀`);
        // 팀당 2경기 → 조별 경기 수 = 조 인원. 그래서 예선 총 경기 = 접수팀 수와 같아진다
        assert.equal(f.groupGames, n, `${n}팀: 예선 경기 수는 접수팀 수와 같다`);
    }
});

test('본선 경기 수 — 4강 3경기 / 8강 7경기 (3·4위전 없음, R8)', () => {
    for (let n = MIN_TEAMS; n <= MAX_TEAMS; n++) {
        const f = routeFormat(n);
        assert.equal(f.playoffGames, f.playoff === 4 ? 3 : 7, `${n}팀`);
        assert.equal(f.totalGames, f.groupGames + f.playoffGames, `${n}팀 총 경기`);
    }
    assert.equal(routeFormat(12).totalGames, 15);
    assert.equal(routeFormat(18).totalGames, 25);
});

test('결정전은 4팀 조에서만 발생 — 3팀 조는 2승 2팀이 구조적으로 불가능 (R6-a)', () => {
    assert.equal(groupCanHaveDecider(3), false);
    assert.equal(groupCanHaveDecider(4), true);
    // 4팀 조가 있는 대회 = 결정전이 나올 수 있는 대회
    const withFour = [];
    for (let n = MIN_TEAMS; n <= MAX_TEAMS; n++)
        if (routeFormat(n).groups.some(g => g === 4)) withFour.push(n);
    assert.deepEqual(withFour, [7, 8, 10, 11, 13, 14, 16, 17]);
});

test('범위 밖 접수팀은 null (수동 모드로 넘김 — D6)', () => {
    for (const n of [0, 4, 6, 19, 32, 7.5, NaN]) assert.equal(routeFormat(n), null, `${n}팀`);
    assert.equal(FORMAT_TABLE.length, MAX_TEAMS - MIN_TEAMS + 1);
    assert.equal(FORMAT_TABLE[0].teams, MIN_TEAMS);
});

/* ══════════════════════════════════════════════════════════
   2. 성적순 시딩 (R7) — 1 vs 4 / 2 vs 3
   ══════════════════════════════════════════════════════════ */

test('9팀 3개조 — 조 1위 3팀 + WC 1팀이 성적순으로 1v4 / 2v3', () => {
    const ms = [
        // A조: A1 2승(경기당 득실 +10) · A2가 2위 중 최고 득실(+16) → 와일드카드
        ...roundRobin('GROUP_A', ['A1', 'A2', 'A3'], { 'A1>A2': [21, 19], 'A1>A3': [21, 3], 'A2>A3': [21, 3] }),
        // B조: B1 2승(경기당 +6)
        ...roundRobin('GROUP_B', ['B1', 'B2', 'B3'], { 'B1>B2': [21, 15], 'B1>B3': [21, 15], 'B2>B3': [21, 15] }),
        // C조: C1 2승(경기당 +8)
        ...roundRobin('GROUP_C', ['C1', 'C2', 'C3'], { 'C1>C2': [21, 13], 'C1>C3': [21, 13], 'C2>C3': [21, 13] }),
    ];
    const s = computePlayoffSeeding(ms, { size: 4 });
    assert.deepEqual(s.pendingTies, []);
    // 조 1위 3팀이 앞(경기당 득실 순 A1 > C1 > B1), 와일드카드 A2가 4시드
    assert.deepEqual(s.ranked.map(t => t.name), ['A1', 'C1', 'B1', 'A2']);
    assert.equal(s.ranked[3].via, 'wc', '4시드는 와일드카드');
    // 1v4가 같은 A조라 3·4시드 교환으로 회피 → [1v3, 2v4]
    s.semis.forEach(([x, y]) => assert.notEqual(x.group, y.group, '같은 조 대결 없음'));
    assert.deepEqual(s.semis.map(p => p.map(t => t.name)), [['A1', 'B1'], ['C1', 'A2']]);
});

test('8강 — 8팀이 1v8 / 2v7 / 3v6 / 4v5로 짝지어진다', () => {
    const mk = (name, group, w, diff) => ({ name, group, rank: 1, groupSize: 3, via: 'win', w, l: 2 - w, gp: 2, pf: 40 + diff, pa: 40, diff });
    const ranked = rankSeeds([
        mk('S1', 'GROUP_A', 2, 30), mk('S2', 'GROUP_B', 2, 20), mk('S3', 'GROUP_C', 2, 10), mk('S4', 'GROUP_D', 2, 5),
        mk('S5', 'GROUP_E', 1, 4), mk('S6', 'GROUP_F', 1, 3), mk('S7', 'GROUP_G', 1, 2), mk('S8', 'GROUP_H', 1, 1),
    ]);
    assert.deepEqual(ranked.map(t => t.name), ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']);
    assert.deepEqual(pairSeeds(ranked).map(p => p.map(t => t.name)),
        [['S1', 'S8'], ['S2', 'S7'], ['S3', 'S6'], ['S4', 'S5']]);
});

test('같은 조 대결은 하위 시드 교환으로 회피된다', () => {
    const mk = (name, group, diff) => ({ name, group, rank: 1, groupSize: 4, via: 'win', w: 2, l: 1, gp: 3, pf: 60 + diff, pa: 60, diff });
    // 1시드와 4시드가 같은 A조 → 3·4시드 교환되어야 함
    const ranked = [mk('A1', 'GROUP_A', 30), mk('B1', 'GROUP_B', 20), mk('C1', 'GROUP_C', 10), mk('A2', 'GROUP_A', 5)];
    const pairs = pairSeeds(ranked);
    pairs.forEach(([x, y]) => assert.notEqual(x.group, y.group));
    assert.deepEqual(pairs.map(p => p.map(t => t.name)), [['A1', 'C1'], ['B1', 'A2']]);
});

/* ══════════════════════════════════════════════════════════
   3. 와일드카드 (R5) — 혼합 조에서 큰 조 2위 우선 (D2)
   ══════════════════════════════════════════════════════════ */

test('10팀(3/3/4) — 4팀 조 2위가 와일드카드를 가져간다 (사장 표 그대로)', () => {
    const ms = [
        ...roundRobin('GROUP_A', ['A1', 'A2', 'A3'], { 'A1>A2': [21, 5], 'A1>A3': [21, 5], 'A2>A3': [21, 5] }),
        ...roundRobin('GROUP_B', ['B1', 'B2', 'B3'], { 'B1>B2': [21, 5], 'B1>B3': [21, 5], 'B2>B3': [21, 5] }),
        // C조 4팀 — C2는 1승 2패로 득실이 A2/B2보다 나쁘지만, 큰 조 2위라 우선
        ...roundRobin('GROUP_C', ['C1', 'C2', 'C3', 'C4'], {
            'C1>C2': [21, 20], 'C1>C3': [21, 20], 'C1>C4': [21, 20],
            'C2>C3': [21, 20], 'C2>C4': [20, 21], 'C3>C4': [21, 20],
        }),
    ];
    const s = computePlayoffSeeding(ms, { size: 4, wcRule: WC_RULE.LARGE_GROUP_FIRST });
    const wc = s.qualified.filter(t => t.via === 'wc');
    assert.equal(wc.length, 1);
    assert.equal(wc[0].group, 'GROUP_C', '4팀 조(C)의 2위가 와일드카드');
    assert.equal(wc[0].groupSize, 4);
});

test('기존 규칙(PER_GAME_ONLY)으로 바꾸면 득실 좋은 3팀 조 2위가 뽑힌다 — 두 규칙이 실제로 다르다', () => {
    const ms = [
        ...roundRobin('GROUP_A', ['A1', 'A2', 'A3'], { 'A1>A2': [21, 20], 'A1>A3': [21, 5], 'A2>A3': [21, 5] }),
        ...roundRobin('GROUP_B', ['B1', 'B2', 'B3'], { 'B1>B2': [21, 20], 'B1>B3': [21, 5], 'B2>B3': [21, 5] }),
        ...roundRobin('GROUP_C', ['C1', 'C2', 'C3', 'C4'], {
            'C1>C2': [21, 5], 'C1>C3': [21, 5], 'C1>C4': [21, 5],
            'C2>C3': [21, 20], 'C2>C4': [20, 21], 'C3>C4': [21, 20],
        }),
    ];
    const large = computePlayoffSeeding(ms, { size: 4, wcRule: WC_RULE.LARGE_GROUP_FIRST });
    const perGame = computePlayoffSeeding(ms, { size: 4, wcRule: WC_RULE.PER_GAME_ONLY });
    assert.equal(large.qualified.find(t => t.via === 'wc').groupSize, 4);
    assert.equal(perGame.qualified.find(t => t.via === 'wc').groupSize, 3);
});

test('WC 슬롯이 후보 수 이상이면 비교 없이 전원 진출하고 추첨 플래그도 안 선다 (R5-③)', () => {
    const ms = [
        ...roundRobin('GROUP_A', ['A1', 'A2', 'A3'], { 'A1>A2': [21, 5], 'A1>A3': [21, 5], 'A2>A3': [21, 5] }),
        ...roundRobin('GROUP_B', ['B1', 'B2', 'B3'], { 'B1>B2': [21, 5], 'B1>B3': [21, 5], 'B2>B3': [21, 5] }),
    ];
    const s = computePlayoffSeeding(ms, { size: 4 }); // 2조 → WC 2자리, 2위 후보도 2팀
    assert.equal(s.qualified.length, 4);
    assert.equal(s.needsDraw, false);
});

/* ══════════════════════════════════════════════════════════
   4. 리스크 #1 — 조 1위 동률이면 시딩을 보류하고, 추가경기 결과로 확정한다 (R6)
   ══════════════════════════════════════════════════════════ */

// 3팀 조는 각 팀 2경기라 "2승 동률"이 구조적으로 불가능(2승은 한 팀뿐).
// 2팀 동률은 4팀 조에서 발생하므로 A조를 4팀으로 둔다.
// (이 픽스처는 풀리그 4팀 조 = 팀당 3경기. 과거 방식으로 운영된 대회의 회귀 케이스)
const tieFixture = () => [
    // A조 4팀: A1·A2 둘 다 2승 1패 → 1위 동률 (A3·A4는 1승)
    ...roundRobin('GROUP_A', ['A1', 'A2', 'A3', 'A4'], {
        'A1>A2': [20, 21], 'A1>A3': [21, 10], 'A1>A4': [21, 10],
        'A2>A3': [21, 10], 'A2>A4': [20, 21], 'A3>A4': [21, 10],
    }),
    ...roundRobin('GROUP_B', ['B1', 'B2', 'B3'], { 'B1>B2': [21, 10], 'B1>B3': [21, 10], 'B2>B3': [21, 10] }),
    ...roundRobin('GROUP_C', ['C1', 'C2', 'C3'], { 'C1>C2': [21, 12], 'C1>C3': [21, 12], 'C2>C3': [21, 12] }),
];

test('조 1위 동률이면 자동 시딩을 보류한다 (득실차로 임의 확정하지 않는다)', () => {
    // 득실차로는 순위를 매길 수 있지만, 승수가 같으므로 임의 확정하지 않고 보류해야 한다
    const ms = tieFixture();
    const s = computePlayoffSeeding(ms, { size: 4 });
    assert.deepEqual(s.pendingTies, ['GROUP_A']);
    assert.equal(s.semis, null, '보류 중에는 대진을 만들지 않는다');
    assert.deepEqual(s.tiedNames.GROUP_A.sort(), ['A1', 'A2']);
    assert.equal(s.tieKinds.GROUP_A, 'TWO_WAY');
});

test('실제 편성(4팀 조·팀당 2경기)에서 2승 2팀이 나오면 결정전 대상이 된다', () => {
    // 4팀 조 팀당 2경기 = 4경기. 서로 만나지 않은 두 팀(A1·A4)이 나란히 2승 하는 상황
    const ms = [
        game('GROUP_A', 'A1', 'A2', 21, 10),
        game('GROUP_A', 'A4', 'A3', 21, 10),
        game('GROUP_A', 'A1', 'A3', 21, 12),
        game('GROUP_A', 'A4', 'A2', 21, 12),
        ...roundRobin('GROUP_B', ['B1', 'B2', 'B3'], { 'B1>B2': [21, 10], 'B1>B3': [21, 10], 'B2>B3': [21, 10] }),
        ...roundRobin('GROUP_C', ['C1', 'C2', 'C3'], { 'C1>C2': [21, 12], 'C1>C3': [21, 12], 'C2>C3': [21, 12] }),
    ];
    const s = computePlayoffSeeding(ms, { size: 4 });
    assert.deepEqual(s.pendingTies, ['GROUP_A'], '2승 2팀 → 결정전 전까지 시딩 보류');
    assert.equal(s.tieKinds.GROUP_A, 'TWO_WAY');
    assert.deepEqual(s.tiedNames.GROUP_A.sort(), ['A1', 'A4']);

    // 결정전 결과가 들어오면 승자가 조 1위
    const after = computePlayoffSeeding([...ms, game('EXTRA', 'A1', 'A4', 12, 15)], { size: 4 });
    assert.deepEqual(after.pendingTies, []);
    assert.equal(after.qualified.find(t => t.group === 'GROUP_A' && t.via === 'win').name, 'A4');
});

test('추가경기(EXTRA) 결과가 들어오면 그 승자가 조 1위로 확정되고 시딩이 진행된다', () => {
    const ms = [...tieFixture(), game('EXTRA', 'A1', 'A2', 15, 18)]; // 추가경기에서 A2 승
    const s = computePlayoffSeeding(ms, { size: 4 });
    assert.deepEqual(s.pendingTies, []);
    const a = s.qualified.find(t => t.group === 'GROUP_A' && t.via === 'win');
    assert.equal(a.name, 'A2', '추가경기 승자가 조 1위');
    assert.ok(s.semis, '대진 생성됨');
    s.semis.forEach(([x, y]) => assert.ok(x && y));
});

test('추가경기가 아직 진행 중(미종료)이면 계속 보류한다', () => {
    const ms = [...tieFixture(), game('EXTRA', 'A1', 'A2', 0, 0, 'PENDING')];
    assert.deepEqual(computePlayoffSeeding(ms, { size: 4 }).pendingTies, ['GROUP_A']);
});

test('다른 조 팀들의 추가경기는 이 조의 동률을 풀지 않는다', () => {
    const ms = [...tieFixture(), game('EXTRA', 'B2', 'C2', 21, 10)];
    assert.deepEqual(computePlayoffSeeding(ms, { size: 4 }).pendingTies, ['GROUP_A']);
});

test('3팀 순환 동률은 득실차로 정렬해 진행하고, 그 근거를 남긴다', () => {
    // 3팀 조는 팀당 2경기라 승수 분포가 (2,1,0) 아니면 (1,1,1) — 즉 동률은 항상 3파전이다.
    // 맞대결이 순환이라 추가경기 한 경기로는 못 가리므로 득실차로 정렬해 진행한다.
    const ms = [
        // A조 순환: A1>A2(1점차), A2>A3(16점차), A3>A1(11점차) — 득실차 A2(+15) > A3(-5) > A1(-10)
        ...roundRobin('GROUP_A', ['A1', 'A2', 'A3'], { 'A1>A2': [21, 20], 'A2>A3': [21, 5], 'A1>A3': [10, 21] }),
        ...roundRobin('GROUP_B', ['B1', 'B2', 'B3'], { 'B1>B2': [21, 10], 'B1>B3': [21, 10], 'B2>B3': [21, 10] }),
        ...roundRobin('GROUP_C', ['C1', 'C2', 'C3'], { 'C1>C2': [21, 12], 'C1>C3': [21, 12], 'C2>C3': [21, 12] }),
    ];
    const s = computePlayoffSeeding(ms, { size: 4 });
    assert.deepEqual(s.pendingTies, [], '보류하지 않고 진행');
    assert.equal(s.qualified.find(t => t.group === 'GROUP_A' && t.via === 'win').name, 'A2', '득실차 1위가 조 1위');
    const note = s.tieNotes.find(n => n.round === 'GROUP_A');
    assert.ok(note, '득실차로 정했다는 안내가 남는다');
    assert.equal(note.decidedBy, 'DIFF');
    assert.equal(note.names.length, 3);
});

test('3팀 동률에서 득실차·득점까지 완전히 같으면 정할 근거가 없어 보류한다', () => {
    // 세 경기 모두 21:20 순환 — 각 팀 득실 +1/-1로 완전 대칭
    const ms = [
        ...roundRobin('GROUP_A', ['A1', 'A2', 'A3'], { 'A1>A2': [21, 20], 'A2>A3': [21, 20], 'A1>A3': [20, 21] }),
        ...roundRobin('GROUP_B', ['B1', 'B2', 'B3'], { 'B1>B2': [21, 10], 'B1>B3': [21, 10], 'B2>B3': [21, 10] }),
    ];
    const s = computePlayoffSeeding(ms, { size: 4 });
    assert.deepEqual(s.pendingTies, ['GROUP_A']);
    assert.equal(s.tieKinds.GROUP_A, 'DEADLOCK');
    assert.equal(s.tiedNames.GROUP_A.length, 3);
});

/* ══════════════════════════════════════════════════════════
   5. 회귀 — 기존 8팀 2조 대회가 그대로 동작해야 한다
   ══════════════════════════════════════════════════════════ */

test('기존 포맷(8팀 2조 4/4)도 4강 대진이 정상 생성된다', () => {
    const ms = [
        ...roundRobin('GROUP_A', ['A1', 'A2', 'A3', 'A4'], {
            'A1>A2': [21, 10], 'A1>A3': [21, 10], 'A1>A4': [21, 10],
            'A2>A3': [21, 12], 'A2>A4': [21, 12], 'A3>A4': [21, 14],
        }),
        ...roundRobin('GROUP_B', ['B1', 'B2', 'B3', 'B4'], {
            'B1>B2': [21, 15], 'B1>B3': [21, 15], 'B1>B4': [21, 15],
            'B2>B3': [21, 16], 'B2>B4': [21, 16], 'B3>B4': [21, 18],
        }),
    ];
    const s = computePlayoffSeeding(ms, { size: 4 });
    assert.deepEqual(s.pendingTies, []);
    assert.equal(s.qualified.length, 4);
    assert.deepEqual(s.ranked.map(t => t.name), ['A1', 'B1', 'A2', 'B2']);
    s.semis.forEach(([x, y]) => assert.notEqual(x.group, y.group, '같은 조 회피'));
    assert.deepEqual(s.semis.map(p => p.map(t => t.name)), [['A1', 'B2'], ['B1', 'A2']]);
});

test('예선이 아직 안 끝났거나 조 경기가 없으면 자동 시딩하지 않는다', () => {
    assert.equal(computePlayoffSeeding([], { size: 4 }), null);
    const ms = roundRobin('GROUP_A', ['A1', 'A2', 'A3'], { 'A1>A2': [21, 5], 'A1>A3': [21, 5], 'A2>A3': [21, 5] });
    assert.equal(computePlayoffSeeding(ms, { size: 4 }), null, '3팀뿐이면 4강 인원 미달');
});

test('추가경기(EXTRA)는 조별 순위 집계에 절대 포함되지 않는다', () => {
    const base = roundRobin('GROUP_A', ['A1', 'A2', 'A3'], { 'A1>A2': [21, 5], 'A1>A3': [21, 5], 'A2>A3': [21, 5] });
    const withExtra = [...base, game('EXTRA', 'A3', 'A1', 21, 0)];
    const only = m => m.round === 'GROUP_A';
    assert.deepEqual(
        standingRowsFor(base.filter(only)),
        standingRowsFor(withExtra.filter(only)),
        'EXTRA를 추가해도 조별 순위는 동일',
    );
});

test('applyExtraGameResult는 동률이 아니면 순위를 건드리지 않는다', () => {
    const rows = [{ name: 'X', w: 2, l: 0, pf: 40, pa: 20 }, { name: 'Y', w: 1, l: 1, pf: 30, pa: 30 }];
    const r = applyExtraGameResult(rows, [{ round: 'EXTRA', team_a_name: 'X', team_b_name: 'Y', winner: 'B_WIN' }]);
    assert.equal(r.unresolved, false);
    assert.deepEqual(r.rows.map(x => x.name), ['X', 'Y']);
});
