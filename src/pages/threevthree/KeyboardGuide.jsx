import { useState, useRef, useLayoutEffect, useEffect } from 'react';

// ────────────────────────────────────────
// 키보드 단축키 안내 오버레이 (전광판 라이브 첫 진입 시 대회당 1회)
// - 사용하는 키 = 테두리 글로우 효과
// - 각 팀 키 → 사이드 라벨로 라인 연결
// - 공통 키 = 하단 레전드(키캡 ── 기능)
// 키맵 출처: Admin.jsx 키보드 핸들러
// ────────────────────────────────────────

const LETTER_ROWS = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

// 팀 키 → 사이드 라벨 (라인으로 연결)
const TEAM = {
    Q: { side: 'left', text: 'A팀 +1점' },
    W: { side: 'left', text: 'A팀 +2점' },
    A: { side: 'left', text: 'A팀 −1 (정정)' },
    S: { side: 'left', text: 'A팀 파울' },
    Z: { side: 'left', text: 'A팀 타임아웃' },
    P: { side: 'right', text: 'B팀 +1점' },
    O: { side: 'right', text: 'B팀 +2점' },
    L: { side: 'right', text: 'B팀 −1 (정정)' },
    K: { side: 'right', text: 'B팀 파울' },
    M: { side: 'right', text: 'B팀 타임아웃' },
};
const LEFT_KEYS = ['Q', 'W', 'A', 'S', 'Z'];
const RIGHT_KEYS = ['P', 'O', 'L', 'K', 'M'];

// 공통 키: 키보드에서 하이라이트 + 하단 레전드로 설명
const COMMON_KEYS = new Set(['R', 'F', 'J', 'B']);
const COMMON_LEGEND = [
    { caps: ['Space'], text: '게임클락 시작 / 정지' },
    { caps: ['F', 'J'], text: '샷클락 12초 리셋' },
    { caps: ['R'], text: '게임클락 10:00 리셋' },
    { caps: ['B'], text: '수동 부저' },
    { caps: ['↑', '↓'], text: '게임클락  +1 / −1초' },
    { caps: ['←', '→'], text: '샷클락  +1 / −1초' },
];

const isHighlighted = (k) => k in TEAM || COMMON_KEYS.has(k);

const ORANGE = '#ee7c1b';

export default function KeyboardGuide({ onClose }) {
    const wrapRef = useRef(null);
    const keyRefs = useRef({});
    const labelRefs = useRef({});
    const [lines, setLines] = useState([]);
    const [dims, setDims] = useState({ w: 0, h: 0 });

    const computeLines = () => {
        const wrap = wrapRef.current;
        if (!wrap) return;
        const base = wrap.getBoundingClientRect();
        const next = [];
        Object.keys(TEAM).forEach((k) => {
            const keyEl = keyRefs.current[k];
            const labelEl = labelRefs.current[k];
            if (!keyEl || !labelEl) return;
            const kr = keyEl.getBoundingClientRect();
            const lr = labelEl.getBoundingClientRect();
            const side = TEAM[k].side;
            // 키 앵커: 라벨이 있는 쪽 모서리 중앙 / 라벨 앵커: 키보드 쪽 안쪽 모서리 중앙
            const ky = kr.top + kr.height / 2 - base.top;
            const ly = lr.top + lr.height / 2 - base.top;
            const kx = (side === 'left' ? kr.left : kr.right) - base.left;
            const lx = (side === 'left' ? lr.right : lr.left) - base.left;
            next.push({ x1: kx, y1: ky, x2: lx, y2: ly });
        });
        setDims({ w: wrap.clientWidth, h: wrap.clientHeight });
        setLines(next);
    };

    useLayoutEffect(() => {
        computeLines();
        const onResize = () => computeLines();
        window.addEventListener('resize', onResize);
        // Anton 폰트 로드 후 레이아웃 변동 보정
        const t1 = setTimeout(computeLines, 160);
        const t2 = setTimeout(computeLines, 500);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(computeLines);
        return () => {
            window.removeEventListener('resize', onResize);
            clearTimeout(t1); clearTimeout(t2);
        };
    }, []);

    // Esc / Enter / Space 로 닫기
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const keyStyle = (hi) => ({
        minWidth: 44, height: 44, padding: '0 6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 9,
        fontFamily: 'Anton, sans-serif', fontSize: 16, letterSpacing: '.02em',
        userSelect: 'none',
        ...(hi
            ? {
                color: '#fff',
                background: 'rgba(238,124,27,0.16)',
                border: `2px solid ${ORANGE}`,
                boxShadow: `0 0 0 3px rgba(238,124,27,0.18), 0 0 14px rgba(238,124,27,0.35)`,
            }
            : {
                color: 'rgba(255,255,255,0.30)',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
            }),
    });

    const labelBox = (k, side) => (
        <div
            key={k}
            ref={(el) => (labelRefs.current[k] = el)}
            style={{
                display: 'flex', alignItems: 'center', gap: 8,
                flexDirection: side === 'left' ? 'row' : 'row-reverse',
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${ORANGE}55`,
                borderRadius: 10, padding: '8px 12px',
            }}
        >
            <span style={{
                fontFamily: 'Anton, sans-serif', fontSize: 14, color: ORANGE,
                minWidth: 24, textAlign: 'center',
                border: `1px solid ${ORANGE}`, borderRadius: 6, padding: '1px 6px',
            }}>{k}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e9e1ca', whiteSpace: 'nowrap' }}>{TEAM[k].text}</span>
        </div>
    );

    const renderKey = (k, extraStyle) => {
        const hi = isHighlighted(k);
        return (
            <div
                key={k}
                ref={hi ? (el) => (keyRefs.current[k] = el) : undefined}
                style={{ ...keyStyle(hi), ...(extraStyle || {}) }}
            >{k}</div>
        );
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(7,9,14,0.86)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#0d111c', border: '2px solid rgba(233,225,202,0.5)',
                    borderRadius: 22, padding: '26px 28px 22px',
                    maxWidth: 'min(1060px, 96vw)', maxHeight: '94vh', overflow: 'auto',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                }}
            >
                {/* 헤더 */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 30, letterSpacing: '.04em', color: '#e9e1ca' }}>
                        ⌨ 키보드로 전광판 조작
                    </div>
                    <div style={{ fontSize: 13, color: '#8ea0c2', marginTop: 6 }}>
                        경기 중 화면을 보지 않고 손가락 감각만으로 · <span style={{ color: ORANGE }}>이 안내는 대회당 한 번만 표시됩니다</span>
                    </div>
                </div>

                {/* 본문: 좌 라벨 · 키보드 · 우 라벨 + SVG 라인 */}
                <div
                    ref={wrapRef}
                    style={{
                        position: 'relative',
                        display: 'grid',
                        gridTemplateColumns: 'minmax(150px, 1fr) auto minmax(150px, 1fr)',
                        gap: 28, alignItems: 'center',
                    }}
                >
                    {/* SVG 라인 오버레이 */}
                    <svg
                        width={dims.w} height={dims.h}
                        style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}
                    >
                        {lines.map((ln, i) => (
                            <g key={i}>
                                <line x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2}
                                    stroke={ORANGE} strokeWidth="1.6" strokeOpacity="0.75" />
                                <circle cx={ln.x1} cy={ln.y1} r="3.2" fill={ORANGE} />
                            </g>
                        ))}
                    </svg>

                    {/* 왼손 = A팀 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 14, letterSpacing: '.14em', color: '#8ea0c2', textAlign: 'center' }}>왼손 · A팀</div>
                        {LEFT_KEYS.map((k) => labelBox(k, 'left'))}
                    </div>

                    {/* 키보드 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'center' }}>
                        {LETTER_ROWS.map((row, ri) => (
                            <div key={ri} style={{ display: 'flex', gap: 7 }}>
                                {row.map((k) => renderKey(k))}
                            </div>
                        ))}
                        {/* 4행: Space + 방향키 */}
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginTop: 2 }}>
                            {renderKey('Space', { minWidth: 250 })}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center' }}>
                                {renderKey('↑', { minWidth: 38, height: 36 })}
                                <div style={{ display: 'flex', gap: 5 }}>
                                    {renderKey('←', { minWidth: 38, height: 36 })}
                                    {renderKey('↓', { minWidth: 38, height: 36 })}
                                    {renderKey('→', { minWidth: 38, height: 36 })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 오른손 = B팀 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 14, letterSpacing: '.14em', color: '#8ea0c2', textAlign: 'center' }}>오른손 · B팀</div>
                        {RIGHT_KEYS.map((k) => labelBox(k, 'right'))}
                    </div>
                </div>

                {/* 하단: 공통 키 레전드 */}
                <div style={{ marginTop: 22, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
                    <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 14, letterSpacing: '.14em', color: '#8ea0c2', textAlign: 'center', marginBottom: 12 }}>공통 · 양손</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px', justifyContent: 'center' }}>
                        {COMMON_LEGEND.map((row, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ display: 'flex', gap: 4 }}>
                                    {row.caps.map((c) => (
                                        <span key={c} style={{
                                            fontFamily: 'Anton, sans-serif', fontSize: 13, color: '#fff',
                                            background: 'rgba(238,124,27,0.16)', border: `1.5px solid ${ORANGE}`,
                                            borderRadius: 6, padding: '2px 8px', minWidth: 26, textAlign: 'center',
                                        }}>{c}</span>
                                    ))}
                                </span>
                                <span style={{ color: '#6d7fa3' }}>──</span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#e9e1ca', whiteSpace: 'nowrap' }}>{row.text}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 닫기 */}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
                    <button
                        onClick={onClose}
                        style={{
                            fontFamily: 'Anton, sans-serif', fontSize: 17, letterSpacing: '.08em',
                            background: ORANGE, color: '#1a0d05', border: 'none', borderRadius: 11,
                            padding: '13px 40px', cursor: 'pointer',
                        }}
                    >시작하기 →</button>
                </div>
            </div>
        </div>
    );
}
