/**
 * GritLab 3x3 — 접수팀 수 기반 포맷 라우팅 + 본선 시딩
 *
 * 기획 원본: Dev/format-routing-plan.md (규칙 R1~R7 · 결정 D1~D7)
 * 이 파일은 순수 함수만 담는다 (React/Supabase/DOM 의존 없음) — Admin.jsx와 골든 테스트의 단일 원천.
 *
 * 2차 작업에서 public/tournament.html(정적 빌더)이 같은 규칙을 쓸 때는
 * 이 파일의 로직을 이식하고 tests/format-routing.test.mjs의 골든 케이스를
 * 양쪽에 동일 적용해 드리프트를 막는다 (기획 §1-F A안).
 */

/* ══════════════════════════════════════════════════════════
   R2·R3 — 접수팀 수 → 조 구성 · 플레이오프 규모
   조 수 = floor(N/3)  … 3팀 조를 최대한 쓰고, 나머지 인원만 4팀 조로 흡수
   플옵  = 조 1위 전원이 들어가는 가장 작은 브라켓 (조 ≤ 4 → 4강 / 조 ≥ 5 → 8강)
   2026-09-03 갱신: 12팀을 4/4/4(3조·WC 1) → 3/3/3/3(4조·WC 0)으로 변경(사장 지시).
   그 결과 ceil/floor 두 갈래였던 조 수 규칙이 floor(N/3) 하나로 단순해졌고,
   13·14팀 경계(D1)도 자동으로 4조 → 4강 · 와일드카드 없음으로 정해진다.
   ══════════════════════════════════════════════════════════ */

export const MIN_TEAMS = 7;
export const MAX_TEAMS = 18;

/** 접수팀 수 → { teams, groups:[3,3,4], groupCount, playoff:4|8, winners, wildcards } · 범위 밖이면 null */
export function routeFormat(teams) {
    if (!Number.isInteger(teams) || teams < MIN_TEAMS || teams > MAX_TEAMS) return null;
    const groupCount = Math.floor(teams / 3);          // R3
    const playoff = groupCount <= 4 ? 4 : 8;           // R2
    const base = Math.floor(teams / groupCount);
    const rem = teams % groupCount;
    // R1: 조 크기는 3 또는 4만. 3팀 조를 앞에, 4팀 조를 뒤에 (사장 표기 3/3/4 순서)
    const groups = Array.from({ length: groupCount }, (_, i) => base + (i >= groupCount - rem ? 1 : 0));
    return {
        teams, groups, groupCount, playoff,
        winners: groupCount,                 // R4: 조 1위 전원 진출
        wildcards: playoff - groupCount,     // R4: 남은 자리 = 와일드카드 (0이면 1위들만으로 채워짐)
    };
}

/** 7~18 전 구간 라우팅 표 — 기획 §1-D와 동일해야 한다 (골든 테스트가 검증) */
export const FORMAT_TABLE = Object.freeze(
    Array.from({ length: MAX_TEAMS - MIN_TEAMS + 1 }, (_, i) => Object.freeze(routeFormat(MIN_TEAMS + i)))
);

/* ══════════════════════════════════════════════════════════
   조별 순위
   ══════════════════════════════════════════════════════════ */

/** 한 조의 경기들 → 순위 행 (승수 → 득실차 → 다득점). 종료되지 않은 경기는 집계에서 제외 */
export function standingRowsFor(games) {
    const stat = {};
    games.forEach(m => {
        const ensure = nm => (stat[nm] = stat[nm] || { name: nm, w: 0, l: 0, pf: 0, pa: 0 });
        const A = ensure(m.team_a_name), B = ensure(m.team_b_name);
        if (m.status !== 'ENDED') return;
        const sa = m.team_a_score || 0, sb = m.team_b_score || 0;
        A.pf += sa; A.pa += sb; B.pf += sb; B.pa += sa;
        const aWon = m.winner ? m.winner === 'A_WIN' : sa > sb;
        if (sa === sb && !m.winner) return;
        if (aWon) { A.w++; B.l++; } else { B.w++; A.l++; }
    });
    return Object.values(stat).sort((x, y) => y.w - x.w || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf);
}

/**
 * R6 — 조 1위 승수 동률 처리.
 *
 *  2팀 동률 → 추가경기(round:'EXTRA') 승자를 1위로 확정. 추가경기가 없으면 unresolved
 *             (호출부는 자동 시딩을 보류하고 운영자에게 추가경기를 제안한다).
 *  3팀 이상 → 맞대결이 순환이라 추가경기 한 경기로 가려지지 않는다. 득실차 → 다득점으로
 *             정렬한 뒤 진행하되(standingRowsFor가 이미 적용) 근거를 알린다.
 *             단 득실차·다득점까지 완전히 같으면 정할 근거가 없으므로 보류(추첨 대상).
 *
 * 3팀 조는 팀당 2경기라 승수 분포가 (2,1,0) 또는 (1,1,1)뿐 — 즉 2팀 동률이 나올 수 없고
 * 동률은 항상 3파전이다. 12·15·18팀처럼 전 조가 3팀인 대회에서 이 경로가 자주 쓰인다.
 *
 * @returns {{rows, unresolved:boolean, tiedNames?:string[], kind?:string, decidedBy?:string}}
 */
export function applyExtraGameResult(rows, extras) {
    if (rows.length < 2 || rows[0].w !== rows[1].w) return { rows, unresolved: false };
    const topW = rows[0].w;
    const tied = rows.filter(r => r.w === topW);
    const tiedNames = tied.map(t => t.name);

    if (tied.length === 2) {
        const ex = (extras || []).find(m =>
            m.winner && tiedNames.includes(m.team_a_name) && tiedNames.includes(m.team_b_name)
            && m.team_a_name !== m.team_b_name);
        if (!ex) return { rows, unresolved: true, tiedNames, kind: 'TWO_WAY' };
        const winnerName = ex.winner === 'A_WIN' ? ex.team_a_name : ex.team_b_name;
        const win = rows.find(r => r.name === winnerName);
        if (!win) return { rows, unresolved: true, tiedNames, kind: 'TWO_WAY' };
        return { rows: [win, ...rows.filter(r => r !== win)], unresolved: false, tiedNames, kind: 'TWO_WAY', decidedBy: 'EXTRA' };
    }

    // 3팀 이상 동률 — 득실차·다득점이 모두 같으면 정할 근거가 없다
    const diff = t => t.pf - t.pa;
    const deadlock = tied.every(t => diff(t) === diff(tied[0]) && t.pf === tied[0].pf);
    if (deadlock) return { rows, unresolved: true, tiedNames, kind: 'DEADLOCK' };
    return { rows, unresolved: false, tiedNames, kind: 'MULTI_WAY', decidedBy: 'DIFF' };
}

/* ══════════════════════════════════════════════════════════
   R5 — 와일드카드 선발
   ① 조 크기가 다르면 큰 조(4팀) 2위가 먼저 (D2 권장값)
   ② 같은 크기끼리는 득실차 → 다득점 → 최소실점
   ③ 슬롯 ≥ 후보 수면 비교 없이 전원 진출
   ══════════════════════════════════════════════════════════ */

export const WC_RULE = Object.freeze({
    LARGE_GROUP_FIRST: 'LARGE_GROUP_FIRST', // D2 권장 — 사장 10팀 행("4팀인조 1/2위")에서 일반화
    PER_GAME_ONLY: 'PER_GAME_ONLY',         // 기존 코드 방식 — 경기 수 차이는 경기당 평균으로만 보정
});

/** 진출 후보 1건 — UI(autoSemiInfo)가 via/group/rank를 읽으므로 필드명 유지 */
function wrapCandidate(row, round, groupSize, idx) {
    return {
        name: row.name, group: round, rank: idx + 1, groupSize,
        via: idx === 0 ? 'win' : 'wc',
        w: row.w, l: row.l, gp: row.w + row.l,
        pf: row.pf, pa: row.pa, diff: row.pf - row.pa,
    };
}

/** standings: [{ round, rows: [wrapCandidate...] }] → { picked, needsDraw, pool } */
export function pickWildcards(standings, slots, rule = WC_RULE.LARGE_GROUP_FIRST) {
    if (slots <= 0) return { picked: [], needsDraw: false, pool: [] };

    // 후보 풀: 2위부터, 슬롯이 찰 때까지 랭크를 내려가며 수집 (같은 랭크는 전부 담아 비교 대상으로)
    const pool = [];
    const maxSize = Math.max(0, ...standings.map(g => g.rows.length));
    for (let rank = 1; pool.length < slots && rank < maxSize; rank++)
        standings.forEach(g => { if (g.rows[rank]) pool.push(g.rows[rank]); });

    const sizesDiffer = new Set(pool.map(c => c.groupSize)).size > 1;
    const gpDiffer = new Set(pool.map(c => c.gp)).size > 1;
    // 경기 수가 다르면 경기당 평균으로 비교 (3팀조 2경기 vs 4팀조 3경기)
    const met = c => { const n = gpDiffer ? (c.gp || 1) : 1; return [c.diff / n, c.pf / n, c.pa / n]; };
    const cmp = (a, b) => {
        if (rule === WC_RULE.LARGE_GROUP_FIRST && sizesDiffer && a.groupSize !== b.groupSize)
            return b.groupSize - a.groupSize;                       // R5-①
        const x = met(a), y = met(b);
        return (y[0] - x[0]) || (y[1] - x[1]) || (x[2] - y[2]);     // R5-②
    };
    pool.sort(cmp);

    // 경계(마지막 진출 vs 첫 탈락)가 완전 동률이면 추첨 확인 필요
    const needsDraw = pool.length > slots && cmp(pool[slots - 1], pool[slots]) === 0;
    return { picked: pool.slice(0, slots), needsDraw, pool };
}

/* ══════════════════════════════════════════════════════════
   R7 — 본선 시딩: 성적순 정렬 → 1 vs 4 / 2 vs 3 (8강은 1v8·2v7·3v6·4v5)
   ══════════════════════════════════════════════════════════ */

/**
 * 진출팀 성적순 정렬.
 * ① 조 1위 전원이 와일드카드보다 위
 * ② 같은 그룹 안에서는 승률 → 경기당 득실차 → 경기당 득점
 *    (3팀조 2경기 / 4팀조 3경기라 총계가 아닌 경기당 값으로 비교 — D7 권장값)
 */
export function rankSeeds(qualified) {
    const met = c => { const n = c.gp || 1; return [c.w / n, c.diff / n, c.pf / n]; };
    return [...qualified].sort((a, b) => {
        if (a.via !== b.via) return a.via === 'win' ? -1 : 1;
        const x = met(a), y = met(b);
        return (y[0] - x[0]) || (y[1] - x[1]) || (y[2] - x[2]);
    });
}

/** 같은 조 대결이 남지 않도록 하위 시드끼리 교환 (조당 최대 2팀이면 해가 항상 존재) */
function avoidSameGroup(pairs) {
    const bad = ps => ps.reduce((n, p) => n + (p[0].group === p[1].group ? 1 : 0), 0);
    if (bad(pairs) === 0) return pairs;
    const n = pairs.length;
    const swap = (ps, i, j) => {
        const alt = ps.map(p => [...p]);
        [alt[i][1], alt[j][1]] = [alt[j][1], alt[i][1]];
        return alt;
    };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const one = swap(pairs, i, j);
        if (bad(one) === 0) return one;
    }
    // 8강에서 드물게 1회 교환으로 안 풀리는 배치 — 2회까지 탐색
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const one = swap(pairs, i, j);
        for (let k = 0; k < n; k++) for (let l = k + 1; l < n; l++) {
            const two = swap(one, k, l);
            if (bad(two) === 0) return two;
        }
    }
    return pairs; // 단일 조 등 회피 불가 — 원안 유지
}

/** 성적순 배열 → 매치업. 4팀: [1v4, 2v3] · 8팀: [1v8, 2v7, 3v6, 4v5] (승자 교차는 상위 시드가 위) */
export function pairSeeds(ranked) {
    const n = ranked.length;
    const pairs = Array.from({ length: Math.floor(n / 2) }, (_, i) => [ranked[i], ranked[n - 1 - i]]);
    return avoidSameGroup(pairs);
}

/* ══════════════════════════════════════════════════════════
   진입점 — 경기 목록 → 본선 대진
   ══════════════════════════════════════════════════════════ */

/**
 * @param {Array} matches  game_3v3_brackets row 배열 (GROUP_* / EXTRA / SEMI ...)
 * @param {{size?:4|8, wcRule?:string}} options
 * @returns null                                   — 조 경기가 없거나 진출팀이 부족해 자동 시딩 불가
 *          { pendingTies:[round], tiedNames }      — 조 1위 동률 미해소 → 시딩 보류 (R6)
 *          { semis, ranked, qualified, needsDraw } — 정상
 */
export function computePlayoffSeeding(matches, options = {}) {
    const { size = 4, wcRule = WC_RULE.LARGE_GROUP_FIRST } = options;
    const groupGames = matches.filter(m => m.round?.startsWith('GROUP_') && m.team_a_name && m.team_b_name);
    const groupRounds = [...new Set(groupGames.map(m => m.round))].sort();
    if (!groupRounds.length) return null;

    const extras = matches.filter(m => m.round === 'EXTRA' && m.status === 'ENDED' && m.winner);

    // 조별 순위 — 추가경기 결과를 반영해 1위를 확정 (R6)
    const pendingTies = [], tiedNames = {}, tieKinds = {}, tieNotes = [];
    const standings = groupRounds.map(round => {
        const raw = standingRowsFor(groupGames.filter(m => m.round === round));
        const res = applyExtraGameResult(raw, extras);
        if (res.unresolved) {
            pendingTies.push(round);
            tiedNames[round] = res.tiedNames || [];
            tieKinds[round] = res.kind || 'TWO_WAY';
        } else if (res.decidedBy === 'DIFF') {
            // 막지는 않지만 근거를 남긴다 — 운영자가 뒤집고 싶으면 대진을 직접 편성하면 된다
            tieNotes.push({ round, names: res.tiedNames || [], decidedBy: 'DIFF' });
        }
        return { round, rows: res.rows.map((r, i) => wrapCandidate(r, round, res.rows.length, i)) };
    });
    if (pendingTies.length) return { pendingTies, tiedNames, tieKinds, tieNotes, semis: null, qualified: null, needsDraw: false };

    const G = groupRounds.length;
    let qualified, needsDraw = false;
    if (G === 1) {
        // 단일 조 — 그 조 상위 size팀
        qualified = standings[0].rows.slice(0, size).map((c, i) => ({ ...c, via: i === 0 ? 'win' : 'wc' }));
    } else {
        const winners = standings.map(g => g.rows[0]).filter(Boolean);
        const slots = size - winners.length;
        if (slots < 0) {
            qualified = rankSeeds(winners).slice(0, size); // 조 수 > 본선 인원 — 1위들 중 성적순
        } else if (slots === 0) {
            qualified = winners;
        } else {
            const wc = pickWildcards(standings, slots, wcRule);
            needsDraw = wc.needsDraw;
            qualified = winners.concat(wc.picked);
        }
    }
    if (qualified.length < size) return null; // 진출팀 부족 — 수동 편성 영역

    const ranked = rankSeeds(qualified);
    return { semis: pairSeeds(ranked), ranked, qualified, needsDraw, pendingTies: [], tieNotes };
}
