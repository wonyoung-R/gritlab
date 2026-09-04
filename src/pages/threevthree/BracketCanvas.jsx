import { useEffect, useRef, useState } from 'react';
// 렌더러는 public/에 둔다 — 정적 페이지(public/tournament.html)도 같은 파일을 쓰기 위함.
// 사본을 두면 디자인이 갈라지므로 원본 하나만 유지한다.
import { drawBracket, ensureBracketFonts, bracketToBlob, BASE } from '../../../public/format-bracket.js';

/** game_3v3_brackets row → 렌더러가 쓰는 형태 */
const toMatch = (m) => ({
    round: m.round, order: m.match_order,
    a: m.team_a_name || '', b: m.team_b_name || '',
    sa: m.team_a_score, sb: m.team_b_score,
    winner: m.winner === 'A_WIN' ? 'A' : m.winner === 'B_WIN' ? 'B' : null,
});

/**
 * 대진표를 캔버스로 그린다. 화면 표시와 PNG 저장이 같은 그림을 쓴다.
 * @param {{matches:Array, size:4|8, subtitle?:string, showScores?:boolean,
 *          scale?:number, className?:string, style?:object}} props
 *   scale — 내부 해상도 배율. 화면은 1, 저장은 2 (선명도)
 */
export default function BracketCanvas({ matches, size, subtitle, showScores = true, scale = 1, style, className }) {
    const ref = useRef(null);
    const [logo, setLogo] = useState(null);

    // 로고는 한 번만 읽는다
    useEffect(() => {
        const img = new Image();
        img.onload = () => setLogo(img);
        img.onerror = () => setLogo(null);
        img.src = '/gritlab-logo.png';
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await ensureBracketFonts();
            if (cancelled || !ref.current) return;
            const cv = ref.current;
            cv.width = BASE.w * scale;
            cv.height = BASE.h * scale;
            drawBracket(cv.getContext('2d'),
                { size, matches: (matches || []).map(toMatch), subtitle, showScores, logo },
                { w: cv.width, h: cv.height });
        })();
        return () => { cancelled = true; };
    }, [matches, size, subtitle, showScores, scale, logo]);

    return <canvas ref={ref} className={className}
        style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', ...style }} />;
}

/** 캔버스를 PNG 파일로 내려받는다 */
export async function downloadBracketPng(canvas, filename = 'gritlab-bracket.png') {
    const blob = await bracketToBlob(canvas);
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
}
