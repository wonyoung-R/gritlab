/**
 * GritLab 3x3 — 토너먼트 대진표 렌더러
 *
 * 디자인 원본: Dev/bracket design/Tournament Bracket.dc.html (1536 × 1024 절대좌표)
 * 좌표·색상·폰트는 그 파일을 그대로 옮긴 것이다. 디자인이 바뀌면 원본을 먼저 고치고 여기에 반영한다.
 *
 * 캔버스에 직접 그린다 — 화면 표시와 PNG 저장이 같은 코드를 쓰게 하기 위함.
 * (DOM을 이미지로 바꾸는 방식은 폰트·그림자·필터에서 화면과 저장본이 갈린다)
 * React 의존 없음.
 */

/** 디자인 원본 크기. 다른 해상도는 이 비율로 확대·축소한다 */
export const BASE = { w: 1536, h: 1024 };

export const T = {
    navy: '#0b1a2e',
    cream: '#f1ece0',
    creamDim: '#e9e2d2',
    creamBrush: '#efe9db',
    line: '#e5dfd0',
    gold: '#c9a24a',
    goldBright: '#e0b954',
    goldFill: '#d4ab4c',
    display: 'Anton',
    kr: '"Noto Sans KR"',
    vs: 'Oswald',
};

/** 캔버스는 로드된 폰트만 쓴다 — 그리기 전에 반드시 await */
export async function ensureBracketFonts() {
    if (typeof document === 'undefined' || !document.fonts) return;
    const want = ['400 84px Anton', '900 60px "Noto Sans KR"', '700 26px "Noto Sans KR"',
        '500 36px "Noto Sans KR"', 'italic 700 36px Oswald'];
    try {
        await Promise.all(want.map(f => document.fonts.load(f).catch(() => {})));
        await document.fonts.ready;
    } catch { /* 실패해도 폴백 폰트로 그린다 */ }
}

const rand = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

/* ══════════════════ 그리기 도우미 ══════════════════ */

/** 붓으로 칠한 듯 가장자리가 불규칙한 사각형 (원본의 feTurbulence 대체) */
function brushPath(ctx, x, y, w, h, seed, amp = 0.055) {
    const r = rand(seed);
    const a = h * amp;
    const wob = () => (r() - 0.5) * 2 * a;
    ctx.beginPath();
    const n = 9;
    ctx.moveTo(x - a * 0.5, y + wob());
    for (let i = 0; i <= n; i++) ctx.lineTo(x + (w * i) / n, y + wob());
    ctx.lineTo(x + w + a * 0.6, y + h * 0.5 + wob() * 0.4);
    for (let i = n; i >= 0; i--) ctx.lineTo(x + (w * i) / n, y + h + wob());
    ctx.lineTo(x - a * 0.5, y + h * 0.55 + wob());
    ctx.closePath();
}

/** 붓칠 배경 + 그 뒤에 살짝 어긋난 반투명 그림자 레이어 (원본 ::before/::after 재현) */
function brushFill(ctx, x, y, w, h, color, ghost, seed) {
    ctx.save();
    ctx.fillStyle = ghost;
    brushPath(ctx, x + 5, y + 2, w + 1, h + 1, seed + 13, 0.075);
    ctx.fill();
    ctx.fillStyle = color;
    brushPath(ctx, x, y, w, h, seed, 0.05);
    ctx.fill();
    ctx.restore();
}

/** 붓칠 테두리 (하위 시드 박스) */
function brushStroke(ctx, x, y, w, h, color, faint, seed) {
    ctx.save();
    ctx.strokeStyle = faint; ctx.lineWidth = 1.5;
    brushPath(ctx, x + 5, y + 4, w - 1, h - 1, seed + 13, 0.05); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    brushPath(ctx, x, y, w, h, seed, 0.035); ctx.stroke();
    ctx.restore();
}

/** 금색 발광 박스 — 테두리 + 위→아래 옅어지는 배경 + 바깥 글로우 + 안쪽 광 */
function glowBox(ctx, x, y, w, h, { border, bw, g1, g2, glow, inset }) {
    ctx.save();
    // 바깥 글로우 (두 겹)
    ctx.shadowColor = glow.color; ctx.shadowBlur = glow.far;
    ctx.strokeStyle = border; ctx.lineWidth = bw;
    ctx.strokeRect(x, y, w, h);
    ctx.shadowBlur = glow.near; ctx.strokeRect(x, y, w, h);
    ctx.shadowBlur = 0;
    // 배경 그라디언트
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, g1); g.addColorStop(1, g2);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    // 안쪽 광 — 가장자리에서 안으로 스며드는 느낌
    const ig = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.1,
        x + w / 2, y + h / 2, Math.max(w, h) * 0.62);
    ig.addColorStop(0, 'rgba(201,162,74,0)'); ig.addColorStop(1, inset);
    ctx.fillStyle = ig; ctx.fillRect(x, y, w, h);
    // 테두리 다시 (배경 위에 또렷하게)
    ctx.strokeStyle = border; ctx.lineWidth = bw; ctx.strokeRect(x, y, w, h);
    ctx.restore();
}

/** 자간을 적용한 텍스트. box(x,y,w,h) 안에 가운데 정렬 */
function txt(ctx, str, x, y, w, h, { font, size, color, track = 0, weight = '', style = '' }) {
    if (str == null || str === '') return;
    ctx.save();
    ctx.font = `${style} ${weight} ${size}px ${font}`.trim();
    ctx.fillStyle = color; ctx.textBaseline = 'middle';
    const cy = y + h / 2;
    if (!track) {
        ctx.textAlign = 'center'; ctx.fillText(str, x + w / 2, cy);
    } else {
        const chars = [...str];
        const total = chars.reduce((s, c) => s + ctx.measureText(c).width + track, -track);
        let cx = x + w / 2 - total / 2;
        ctx.textAlign = 'left';
        chars.forEach(c => { ctx.fillText(c, cx, cy); cx += ctx.measureText(c).width + track; });
    }
    ctx.restore();
}

/** 박스를 넘치면 글자 크기를 줄인다 */
function fitSize(ctx, str, maxW, font, weight, size, min = 16) {
    let s = size;
    while (s > min) { ctx.font = `${weight} ${s}px ${font}`.trim(); if (ctx.measureText(str).width <= maxW) break; s -= 2; }
    return s;
}

/** SVG path 문자열(M/H/V만 사용) 그대로 그리기 — 디자인 원본의 연결선을 옮겨 쓴다 */
function svgPath(ctx, d, color, width, S) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width * S; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    ctx.beginPath();
    let cx = 0, cy = 0;
    for (const m of d.matchAll(/([MHV])\s*(-?[\d.]+)(?:\s+(-?[\d.]+))?/g)) {
        const [, cmd, a, b] = m;
        if (cmd === 'M') { cx = +a * S; cy = +b * S; ctx.moveTo(cx, cy); }
        else if (cmd === 'H') { cx = +a * S; ctx.lineTo(cx, cy); }
        else if (cmd === 'V') { cy = +a * S; ctx.lineTo(cx, cy); }
    }
    ctx.stroke(); ctx.restore();
}

/* ══════════════════ 본체 ══════════════════ */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{size:4|8, matches:{round,order,a,b,sa,sb,winner}[], subtitle?:string,
 *          logo?:HTMLImageElement, showScores?:boolean}} data
 * @param {{w:number,h:number}} dim  1536×1024 비율 기준으로 확대·축소된다
 */
export function drawBracket(ctx, data, dim) {
    const { w: W, h: H } = dim;
    const S = W / BASE.w;
    const size = data.size === 8 ? 8 : 4;
    const showScores = data.showScores !== false;
    const P = (v) => v * S;                              // 디자인 좌표 → 캔버스 좌표

    /* ── 배경 ── */
    ctx.fillStyle = T.navy; ctx.fillRect(0, 0, W, H);
    let g = ctx.createRadialGradient(W * 0.5, H * 0.30, 0, W * 0.5, H * 0.30, W * 0.60);
    g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(W * 0.20, H * 0.90, 0, W * 0.20, H * 0.90, W * 0.60);
    g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    /* ── 머리말 ── */
    txt(ctx, 'GRIT LAB', 0, P(22), W, P(28), { font: T.display, size: P(28), color: T.creamDim, track: P(28) * 0.04 });
    txt(ctx, 'TOURNAMENT BRACKET', 0, P(56), W, P(84), { font: T.display, size: P(84), color: T.cream, track: P(84) * 0.02 });

    const sub = data.subtitle || `${size}강 대진표`;
    ctx.font = `900 ${P(38)}px ${T.kr}`;
    const subW = ctx.measureText(sub).width + P(38) * 0.14 * (sub.length - 1);
    txt(ctx, sub, W / 2 - subW / 2, P(154), subW, P(38), { font: T.kr, weight: '900', size: P(38), color: T.gold, track: P(38) * 0.14 });
    // 양옆 테이퍼 막대 (원본 clip-path 재현)
    const dashW = P(110), dashH = P(5), gap = P(22), dy = P(154) + P(38) / 2 - dashH / 2;
    const taper = (x, flip) => {
        ctx.save(); ctx.fillStyle = T.gold; ctx.beginPath();
        if (!flip) { ctx.moveTo(x, dy + dashH * 0.4); ctx.lineTo(x + dashW, dy); ctx.lineTo(x + dashW, dy + dashH); ctx.lineTo(x, dy + dashH * 0.7); }
        else { ctx.moveTo(x, dy); ctx.lineTo(x + dashW, dy + dashH * 0.4); ctx.lineTo(x + dashW, dy + dashH * 0.7); ctx.lineTo(x, dy + dashH); }
        ctx.closePath(); ctx.fill(); ctx.restore();
    };
    taper(W / 2 - subW / 2 - gap - dashW, false);
    taper(W / 2 + subW / 2 + gap, true);

    /* ── 데이터 매핑 ── */
    const M = (round, order) => data.matches?.find(m => m.round === round && m.order === order) || null;
    const winOf = (m) => (m && m.winner ? (m.winner === 'A' ? m.a : m.b) : '');
    const sc = (m, side) => (showScores && m && m.winner ? String(side === 'a' ? (m.sa ?? 0) : (m.sb ?? 0)) : '');

    /* ── 공통 블록 ── */
    // 상위 시드: 크림 붓칠 + 남색 글씨
    const seedTop = (x, y, w, h, name, score, won) => {
        brushFill(ctx, x, y, w, h, T.creamBrush, 'rgba(239,233,219,0.5)', Math.round(y + x));
        drawNameScore(x, y, w, h, name, score, T.navy, won ? T.navy : 'rgba(11,26,46,0.45)', '900', P(34));
    };
    // 하위 시드: 붓칠 테두리 + 크림 글씨
    const seedBot = (x, y, w, h, name, score, won) => {
        brushStroke(ctx, x, y, w, h, 'rgba(239,233,219,0.8)', 'rgba(239,233,219,0.35)', Math.round(y + x + 5));
        drawNameScore(x, y, w, h, name, score, T.cream, won ? T.goldBright : 'rgba(241,236,224,0.45)', '900', P(34));
    };
    function drawNameScore(x, y, w, h, name, score, nameColor, scoreColor, weight, base) {
        const pad = score ? P(58) : P(20);
        const fs = fitSize(ctx, name, w - pad * 2, T.kr, weight, base, P(16));
        txt(ctx, name, x + (score ? P(14) : 0), y, w - (score ? P(52) : 0), h,
            { font: T.kr, weight, size: fs, color: nameColor });
        if (score) {
            ctx.save(); ctx.font = `400 ${P(30)}px ${T.display}`; ctx.fillStyle = scoreColor;
            ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
            ctx.fillText(score, x + w - P(14), y + h / 2); ctx.restore();
        }
    }
    // 금색 라벨 (CHAMPION / FINAL / 4강 A·B)
    const goldLabel = (x, y, w, h, label, font, fsize, track, weight = '') => {
        brushFill(ctx, x, y, w, h, T.goldFill, 'rgba(212,171,76,0.55)', Math.round(x + y + 3));
        txt(ctx, label, x, y, w, h, { font, weight, size: fsize, color: T.navy, track });
    };
    // 금색 발광 슬롯
    const goldSlot = (x, y, w, h, name, level) => {
        const spec = level === 'champ'
            ? { border: T.goldBright, bw: P(4), g1: 'rgba(201,162,74,0.28)', g2: 'rgba(201,162,74,0.06)',
                glow: { far: P(120), near: P(60), color: 'rgba(201,162,74,0.6)' }, inset: 'rgba(201,162,74,0.22)' }
            : level === 'final'
                ? { border: T.goldBright, bw: P(3), g1: 'rgba(201,162,74,0.22)', g2: 'rgba(201,162,74,0.05)',
                    glow: { far: P(80), near: P(40), color: 'rgba(201,162,74,0.4)' }, inset: 'rgba(201,162,74,0.18)' }
                : { border: T.gold, bw: P(2), g1: 'rgba(201,162,74,0.16)', g2: 'rgba(201,162,74,0.04)',
                    glow: { far: P(56), near: P(28), color: 'rgba(201,162,74,0.28)' }, inset: 'rgba(201,162,74,0.12)' };
        glowBox(ctx, x, y, w, h, spec);
        if (!name) return;
        const base = level === 'champ' ? P(60) : level === 'final' ? P(40) : P(36);
        const col = level === 'champ' ? 'rgba(224,185,84,0.92)' : level === 'final' ? 'rgba(224,185,84,0.85)' : 'rgba(201,162,74,0.85)';
        const fs = fitSize(ctx, name, w - P(28), T.kr, '900', base, P(16));
        txt(ctx, name, x, y, w, h, { font: T.kr, weight: '900', size: fs, color: col, track: level === 'champ' ? fs * 0.1 : 0 });
    };
    const vs = (x, y, w, h, fsize) => txt(ctx, 'VS', x, y, w, h,
        { font: T.vs, style: 'italic', weight: '700', size: fsize, color: T.gold });
    const roundLabel = (x, y, w, label) => txt(ctx, label, x, y, w, P(24),
        { font: T.kr, weight: '700', size: P(24), color: T.cream });

    /* ── 레이아웃 ── */
    const fin = M('FINAL', 1);
    const champ = winOf(fin);

    if (size === 8) {
        const q = [M('QUARTER', 1), M('QUARTER', 4), M('QUARTER', 2), M('QUARTER', 3)]; // ①②③④
        const s1 = M('SEMI', 1), s2 = M('SEMI', 2);
        const ph = [['1위', '8위'], ['4위', '5위'], ['2위', '7위'], ['3위', '6위']];

        // 연결선 (디자인 원본 path 그대로)
        svgPath(ctx, 'M260 365H280V470H260M280 417H290V490H300M260 665H280V770H260M280 717H290V644H300M470 490H488V644H470M488 567H508', T.line, 3, S);
        svgPath(ctx, 'M1276 365H1256V470H1276M1256 417H1246V490H1236M1276 665H1256V770H1276M1256 717H1246V644H1236M1066 490H1048V644H1066M1048 567H1028', T.line, 3, S);
        svgPath(ctx, 'M768 392V458', T.gold, 4, S);

        // 8강 4경기
        const cols = [[60, 296], [60, 596], [1276, 296], [1276, 596]];
        cols.forEach(([cx, cy], i) => {
            const m = q[i];
            roundLabel(P(cx), P(cy), P(200), `8강 ${['①', '②', '③', '④'][i]}`);
            seedTop(P(cx), P(cy + 39), P(200), P(60), m?.a || ph[i][0], sc(m, 'a'), m?.winner === 'A');
            vs(P(cx), P(cy + 108), P(200), P(28), P(28));
            seedBot(P(cx), P(cy + 144), P(200), P(60), m?.b || ph[i][1], sc(m, 'b'), m?.winner === 'B');
        });

        // 4강 A / B
        [[300, s1, '4강 A', ['① 승자', '② 승자']], [1066, s2, '4강 B', ['③ 승자', '④ 승자']]].forEach(([x, sm, lbl, phs]) => {
            goldLabel(P(x), P(403), P(170), P(38), lbl, T.kr, P(26), 0, '700');
            goldSlot(P(x), P(455), P(170), P(70), sm?.a || phs[0], 'semi');
            vs(P(x), P(549), P(170), P(36), P(36));
            goldSlot(P(x), P(609), P(170), P(70), sm?.b || phs[1], 'semi');
        });

        // CHAMPION · FINAL
        goldLabel(P(658), P(214), P(220), P(44), 'CHAMPION', T.display, P(26), P(26) * 0.1);
        goldSlot(P(578), P(272), P(380), P(120), champ || '우승팀', 'champ');
        goldLabel(P(648), P(458), P(240), P(50), 'FINAL', T.display, P(34), P(34) * 0.08);
        goldSlot(P(508), P(522), P(220), P(90), fin?.a || '4강 A 승자', 'final');
        vs(P(728), P(522), P(80), P(90), P(40));
        goldSlot(P(808), P(522), P(220), P(90), fin?.b || '4강 B 승자', 'final');

        footer(ctx, data, W, P(690), S);
    } else {
        const s1 = M('SEMI', 1), s2 = M('SEMI', 2);
        svgPath(ctx, 'M410 465H450V635H410M450 550H488', T.line, 3, S);
        svgPath(ctx, 'M1126 465H1086V635H1126M1086 550H1048', T.line, 3, S);
        svgPath(ctx, 'M768 392V434', T.gold, 4, S);

        [[110, s1, '4강 ①', ['1위', '4위']], [1126, s2, '4강 ②', ['2위', '3위']]].forEach(([x, m, lbl, ph]) => {
            roundLabel(P(x), P(376), P(300), lbl);
            seedTop(P(x), P(425), P(300), P(80), m?.a || ph[0], sc(m, 'a'), m?.winner === 'A');
            vs(P(x), P(532), P(300), P(36), P(36));
            seedBot(P(x), P(595), P(300), P(80), m?.b || ph[1], sc(m, 'b'), m?.winner === 'B');
        });

        goldLabel(P(658), P(214), P(220), P(44), 'CHAMPION', T.display, P(26), P(26) * 0.1);
        goldSlot(P(568), P(272), P(400), P(120), champ || '우승팀', 'champ');
        goldLabel(P(638), P(434), P(260), P(50), 'FINAL', T.display, P(34), P(34) * 0.08);
        goldSlot(P(488), P(500), P(240), P(100), fin?.a || '① 승자', 'final');
        vs(P(728), P(500), P(80), P(100), P(40));
        goldSlot(P(808), P(500), P(240), P(100), fin?.b || '② 승자', 'final');

        footer(ctx, data, W, P(680), S);
    }
}

function footer(ctx, data, W, y, S) {
    const P = v => v * S;
    if (data.logo && data.logo.naturalWidth) {
        const lw = P(120), lh = lw * (data.logo.naturalHeight / data.logo.naturalWidth);
        ctx.drawImage(data.logo, W / 2 - lw / 2, y, lw, lh);
        y += lh + P(16);
    } else y += P(60);
    txt(ctx, 'GRIT LAB', 0, y, W, P(30), { font: T.display, size: P(30), color: T.cream, track: P(30) * 0.05 });
    txt(ctx, 'BE LOCKED IN', 0, y + P(38), W, P(16), { font: T.kr, weight: '700', size: P(16), color: T.gold, track: P(16) * 0.3 });
}

/** 캔버스 → PNG Blob (다운로드·공유용) */
export const bracketToBlob = (canvas, type = 'image/png', q = 0.95) =>
    new Promise(res => canvas.toBlob(res, type, q));
