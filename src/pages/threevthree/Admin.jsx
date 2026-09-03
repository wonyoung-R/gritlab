import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useParams } from 'react-router-dom';
import { ChevronUp, ArrowLeft, ArrowLeftRight, Plus, Save, Trash2, Trophy, ChevronDown, Power, Play, Pause, X, Minus, BellRing, Palette, ChevronsUp, ChevronsDown, Keyboard, ChevronLeft, ChevronRight, GripVertical, Lock, Unlock, Flag, Maximize2, LayoutDashboard } from 'lucide-react';
import { computePlayoffSeeding, standingRowsFor } from '../../lib/format-routing';
import styles from './scoreboard.glab.module.css';
import KeyboardGuide from './KeyboardGuide';

// ── 롱프레스 감지 훅 (Scoreboard.jsx와 동일) ──
const useLongPress = (onLongPress, onClick, ms = 600) => {
    const timerRef = useRef();
    const isLongPress = useRef(false);
    const touchStartXY = useRef(null);

    const start = useCallback((e) => {
        isLongPress.current = false;
        if (e.type === 'touchstart' && e.targetTouches) {
            touchStartXY.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY };
        } else if (e.type === 'mousedown') {
            touchStartXY.current = null;
        }
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            onLongPress?.(e);
        }, ms);
    }, [onLongPress, ms]);

    const stop = useCallback((e) => {
        clearTimeout(timerRef.current);
        if (e.type === 'touchend' && isLongPress.current === false && touchStartXY.current) {
            const touch = e.changedTouches[0];
            const dx = Math.abs(touch.clientX - touchStartXY.current.x);
            const dy = Math.abs(touch.clientY - touchStartXY.current.y);
            if (dx > 15 || dy > 15) return;
        }
        if (e.type === 'mouseup' && touchStartXY.current) return;
        if (!isLongPress.current) {
            if (e.cancelable && e.type === 'touchend') e.preventDefault();
            onClick?.(e);
        }
    }, [onClick]);

    return {
        onMouseDown: start, onMouseUp: stop,
        onTouchStart: start, onTouchEnd: stop,
        onMouseLeave: () => clearTimeout(timerRef.current),
        onTouchCancel: () => clearTimeout(timerRef.current),
    };
};

// 팀당 작전타임 기본 개수 — 되돌리기(0 → 최대)와 새 경기 리셋이 같은 값을 쓰도록 한 곳에서 판단
const defaultTimeouts = () => parseInt(localStorage.getItem('gritlab_default_timeouts')) || 1;

const ROUNDS = [
    { id: 'GROUP_A', label: '예선 A' },
    { id: 'GROUP_B', label: '예선 B' },
    { id: 'QUARTER', label: '8강' },
    { id: 'SEMI', label: '4강' },
    { id: '3RD_PLACE', label: '3위전' },
    { id: 'FINAL', label: '결승' },
];

// 경기 진행/탐색 순서 — 예선(GROUP_*)을 한 페이즈로 묶어 전역 match_order로 정렬하면
// A1·B1·A2·B2…처럼 조가 교차된다(같은 조 연속 최소화·휴식 확보). 본선은 라운드 순서대로.
const PHASE_RANK = { GROUP_A: 0, GROUP_B: 0, GROUP_C: 0, GROUP_D: 0, GROUP_E: 0, GROUP_F: 0, QUARTER: 1, SEMI: 2, '3RD_PLACE': 3, FINAL: 4 };
const byPlayOrder = (a, b) =>
    ((PHASE_RANK[a.round] ?? 9) - (PHASE_RANK[b.round] ?? 9))
    || (a.match_order - b.match_order)
    || a.round.localeCompare(b.round);

// ── 본선 시딩 ──
// 순위 계산·와일드카드·성적순 시딩(1v4/2v3)·조 1위 동률 보류는 src/lib/format-routing.js 로 이관(2026-09-03).
// 기획 근거: Dev/format-routing-plan.md (R1~R7) · 골든 테스트: tests/format-routing.test.mjs (npm test)

const statusColor = (s) => {
    if (s === 'ENDED') return '#d8302c'; // GRIT LAB red
    if (s === 'LIVE') return '#34c13e';  // GRIT LAB green
    return '#33456a';                    // navy-line
};

const formatTime = (totalSeconds) => {
    const t = Math.max(0, totalSeconds);
    if (t < 60 && t > 0) {
        // 1분 미만: SS.x 형식 (0.1초 단위 표시)
        const s = Math.floor(t);
        const tenths = Math.floor((Math.round(t * 10) % 10));
        return `${s.toString().padStart(2, '0')}.${tenths}`;
    }
    // ceil 사용(2026-08-27, 사장 제보) — formatShotClock(아래)과 동일 이유:
    // floor면 리셋/시작 직후 실제 1초가 지나기도 전에 표시가 한 칸 내려가 버림
    const wholeSecs = Math.ceil(t);
    const m = Math.floor(wholeSecs / 60);
    const s = wholeSecs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formatShotClock = (seconds) => {
    const t = Math.max(0, seconds);
    if (t < 10 && t > 0) {
        const whole = Math.floor(t);
        const tenths = Math.floor((Math.round(t * 10) % 10));
        return `${whole}.${tenths}`;
    }
    return Math.ceil(t).toString().padStart(2, '0');
};

// 농구 부저 사운드 — 바탕화면(Scoreboard.jsx)과 동일한 2종 mp3 버퍼 방식
// 게임클락(메인) / 샷클락 서로 다른 소리. 첫 인터랙션 시 initBuzzers로 프리로드(디코드 딜레이 제거).
let _audioCtx = null;
let _gameBuf = null;
let _shotBuf = null;

const _ensureCtx = () => {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
};

// 브라우저가 유휴 상태에서 AudioContext를 자동 suspend 시키는 경우, resume()이 끝나기 전에
// start(0)을 호출하면 실제 소리 시작이 resume 완료까지 밀림(부저 지연 원인). 미리 깨워둠.
const _wakeCtx = () => {
    const ctx = _ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
};

const _loadBuf = async (url) => {
    const ctx = _ensureCtx();
    const res = await fetch(url);
    const raw = await res.arrayBuffer();
    return ctx.decodeAudioData(raw);
};

const initBuzzers = async () => {
    if (_gameBuf && _shotBuf) return;
    try {
        [_gameBuf, _shotBuf] = await Promise.all([
            _loadBuf('/sounds/gameclock_buzzer.mp3'),
            _loadBuf('/sounds/shotclock_buzzer.mp3'),
        ]);
    } catch (e) { /* silent — 부저 로드 실패 시 무음 */ }
};

const _playBuf = async (buf) => {
    if (!buf) return;
    try {
        const ctx = _ensureCtx();
        if (ctx.state === 'suspended') await ctx.resume(); // resume 완료를 기다린 후 재생 — 지연 방지
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
    } catch (e) { /* silent */ }
};

// 게임클락(메인) 부저 — 기존 호출처(게임클락 0초·KeyB·인터미션·수동버튼) 그대로 사용
const playBuzzer = () => _playBuf(_gameBuf);
// 샷클락 부저 — 샷클락 0초 전용
const playBuzzerShot = () => _playBuf(_shotBuf);

export default function ThreeVThreeAdmin() {
    const { id: urlTournamentId } = useParams();

    // 로그인 가드 — 세션 없으면 grit-login으로 (grit-login.html/tournament.html과 localStorage 세션 공유)
    // 쓰기는 RLS(auth write)가 이미 막지만, admin UI 자체를 비로그인에게 노출하지 않는다.
    const [authed, setAuthed] = useState(false);
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) { window.location.replace('/grit-login.html'); return; }
            setAuthed(true);
        });
    }, []);

    const [tournaments, setTournaments] = useState([]);
    const [activeTournamentId, setActiveTournamentId] = useState(null);
    const [newTitle, setNewTitle] = useState('');
    const [activeRound, setActiveRound] = useState('GROUP_A');
    const [matches, setMatches] = useState([]);
    const [allMatches, setAllMatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null);
    const [deleting, setDeleting] = useState(null);
    // 네트워크/조회 실패 상태 — "경기 0건"과 "조회 실패"를 화면에서 구분하기 위함 (NEW-02)
    const [netError, setNetError] = useState(null);

    // ── PR-F: 수동 편성 (순서 변경·라운드 이동·ENDED 잠금·몰수패) ──
    const [unlockedIds, setUnlockedIds] = useState(new Set()); // ENDED 잠금 해제된 경기 id
    const [forfeitTarget, setForfeitTarget] = useState(null);  // 몰수패 팀 선택 패널이 열린 경기 id
    const [dragId, setDragId] = useState(null);                // 드래그 중인 경기 id
    const [dragOverId, setDragOverId] = useState(null);        // 드롭 대상 후보 경기 id

    // ── 라이브 스코어보드 상태 ──
    const [liveMatch, setLiveMatch] = useState(null); // 현재 기록중인 match
    const [gameTime, setGameTime] = useState(600);     // 10분
    const [shotClock, setShotClock] = useState(12);
    const [shotClockPaused, setShotClockPaused] = useState(false);
    const [timerRunning, setTimerRunning] = useState(false);
    const [teamAScore, setTeamAScore] = useState(0);
    const [teamBScore, setTeamBScore] = useState(0);
    const [teamAFouls, setTeamAFouls] = useState(0);
    const [teamBFouls, setTeamBFouls] = useState(0);
    const [teamATimeouts, setTeamATimeouts] = useState(defaultTimeouts());
    const [teamBTimeouts, setTeamBTimeouts] = useState(defaultTimeouts());
    const shotClockLastTapRef = useRef(0);
    const [showEditTime, setShowEditTime] = useState(false);
    const [showKbdGuide, setShowKbdGuide] = useState(false); // 키보드 안내 오버레이 (대회당 1회)
    // 팀 좌우 화면 표시 반전 — team_a/team_b 데이터·키보드 매핑은 그대로, 화면 위치만 스왑 (새로고침 시 초기화, 로컬 상태)
    const [sidesSwapped, setSidesSwapped] = useState(false);
    // ── 추가경기(조별예선 동률 타이브레이크 등) — round:'EXTRA'로 저장되어 순위/와일드카드 집계에서 자동 제외됨 ──
    const [showExtraGameForm, setShowExtraGameForm] = useState(false);
    const [extraGameGroup, setExtraGameGroup] = useState('');       // 선택된 조(GROUP_A 등) — 팀 선택지의 출처
    const [extraTeamAName, setExtraTeamAName] = useState('');
    const [extraTeamBName, setExtraTeamBName] = useState('');
    const [extraGameAutoNote, setExtraGameAutoNote] = useState(null); // 자동 감지로 열렸을 때만 안내 문구
    const promptedTieGroupsRef = useRef(new Set()); // 이미 제안한 조 — 중복 팝업 방지
    // ── 인터미션(경기 종료 후 다음 경기 안내 카운트다운) ──
    const [showIntermission, setShowIntermission] = useState(false);
    const [intermissionSec, setIntermissionSec] = useState(90);
    const [intermissionRunning, setIntermissionRunning] = useState(true);
    const [intermissionNext, setIntermissionNext] = useState(null);
    const [rotTick, setRotTick] = useState(0);  // 인터미션 조별 순환 1초 틱 — 조 인덱스(÷10)와 잔여초(10−%10)를 함께 파생
    // ── 대진 자동 완성 (예선 종료 → 4강 시딩) ──
    const [autoSemiInfo, setAutoSemiInfo] = useState(null); // {qualified, needsDraw} — 인터미션 브라켓 배지용
    // 조 1위 승수 동률로 자동 시딩을 보류한 상태 — {rounds:[GROUP_A], names:{GROUP_A:[..]}} (R6)
    const [seedingHold, setSeedingHold] = useState(null);
    // 3팀 순환 동률을 득실차로 정렬했다는 안내 (차단 아님) — [{round, names, decidedBy}]
    const [tieNotes, setTieNotes] = useState([]);
    const autoFillBusyRef = useRef(false);
    // ── 운영 모드: null=모드 선택 랜딩, 'select-tournament'=대회 선택, 'tournament'=전광판↔대기 사이클,
    //    'builder'=경기 목록 관리(전광판 Admin). ?manage=1 = tournament.html(관리자모드)에서 온 경로 — 게이트 생략
    const [adminMode, setAdminMode] = useState(
        new URLSearchParams(window.location.search).get('manage') === '1' ? 'builder' : null
    );
    const [editTarget, setEditTarget] = useState(null);
    const [tempMins, setTempMins] = useState(0);
    const [tempSecs, setTempSecs] = useState(0);
    const [tempMsec, setTempMsec] = useState(0);
    const timerRef = useRef(null);

    // ── 게임클락 롱프레스: 시간 설정, 탭: 재생/일시정지 ──
    const gameClockHandlers = useLongPress(() => {
        setTimerRunning(false);
        setEditTarget('GAME');
        setTempMins(Math.floor(gameTime / 60));
        setTempSecs(Math.floor(gameTime % 60));
        setTempMsec(Math.floor((Math.round(gameTime * 10) % 10)));
        setShowEditTime(true);
    }, () => {
        setTimerRunning(!timerRunning);
    }, 300);

    // ── 샷클락 탭: 12초 리셋, 롱프레스: 설정 창 ──
    // ── 샷클락 탭: 원터치(일시정지 토글), 더블터치(12초 리셋), 롱프레스(직접 설정 창) ──
    const shotClockHandlers = useLongPress(() => {
        setTimerRunning(false);
        setEditTarget('SHOT');
        setTempMins(Math.floor(shotClock / 60));
        setTempSecs(Math.floor(shotClock % 60));
        setTempMsec(Math.floor((Math.round(shotClock * 10) % 10)));
        setShowEditTime(true);
    }, () => {
        const now = Date.now();
        if (now - shotClockLastTapRef.current < 400) {
            setShotClock(12);
            setShotClockPaused(false);
            shotClockLastTapRef.current = 0;
        } else {
            setShotClockPaused(p => !p);
            shotClockLastTapRef.current = now;
        }
    }, 300);

    // ── 대회 목록 로드 ──
    useEffect(() => { fetchTournaments(); }, []);

    const fetchTournaments = async () => {
        const { data, error } = await supabase
            .from('tournaments')
            .select('id, title, type, status, created_at')
            .order('created_at', { ascending: false });

        // 조회 실패를 "대회 0건"으로 위장하지 않는다 — 기존 목록 유지 + 배너 (NEW-02)
        if (error) { setNetError({ scope: '대회 목록', message: error.message }); setLoading(false); return; }
        setNetError(null);

        const allData = data || [];
        setTournaments(allData);

        // useParams()의 urlTournamentId는 항상 문자열인데 tournaments.id는 Supabase에서 숫자로 온다
        // (tournament.html deleteTournament와 동일 버그, 2026-08-30 발견) — 문자열 비교로 통일.
        // 안 고치면 URL의 특정 대회 대신 allData[0](최신 생성 대회, 3v3 아닐 수도 있음)로 조용히 바뀜
        const urlMatch = allData.find(t => String(t.id) === String(urlTournamentId));
        if (urlTournamentId && urlMatch) {
            setActiveTournamentId(urlMatch.id);
        } else if (allData.length > 0 && !activeTournamentId) {
            setActiveTournamentId(allData[0].id);
        }
        setLoading(false);
    };

    // ── 부저 사운드 프리로드: 첫 인터랙션(클릭/터치/키) 시 버퍼 디코드 ──
    useEffect(() => {
        const handler = () => { initBuzzers(); };
        document.addEventListener('click', handler, { once: true });
        document.addEventListener('touchstart', handler, { once: true });
        document.addEventListener('keydown', handler, { once: true });
        return () => {
            document.removeEventListener('click', handler);
            document.removeEventListener('touchstart', handler);
            document.removeEventListener('keydown', handler);
        };
    }, []);

    // ── 경기 목록 로드 ──
    useEffect(() => {
        setAutoSemiInfo(null); setSeedingHold(null); setTieNotes([]); // 대회 전환 시 자동시딩 배지·보류/안내 초기화
        if (!activeTournamentId) { setMatches([]); setAllMatches([]); return; }
        fetchMatches();
    }, [activeTournamentId]);

    useEffect(() => {
        // 순서 변경(match_order 갱신)이 즉시 화면에 반영되도록 정렬해서 파생
        setMatches(allMatches.filter(m => m.round === activeRound).sort((a, b) => a.match_order - b.match_order));
    }, [activeRound, allMatches]);

    const fetchMatches = async () => {
        const { data, error } = await supabase
            .from('game_3v3_brackets')
            .select('*')
            .eq('tournament_id', activeTournamentId)
            .order('round')
            .order('match_order', { ascending: true });
        // 조회 실패 시 기존 allMatches를 비우지 않는다 — 빈 화면을 "데이터 소실"로
        // 오인해 대진표를 다시 만드는 사고를 막는다 (NEW-02)
        if (error) { setNetError({ scope: '경기 목록', message: error.message }); return; }
        setNetError(null);
        setAllMatches(data || []);
    };

    // ── 타이머 로직 (100ms 간격 → 1/10초 정밀도) ──
    useEffect(() => {
        if (timerRunning) {
            _wakeCtx(); // 클락 시작 시점에 미리 깨워서 종료 부저(0초) 시점 resume 지연을 방지
            let lastUpdate = Date.now();
            timerRef.current = setInterval(() => {
                const now = Date.now();
                const diff = (now - lastUpdate) / 1000;
                lastUpdate = now;
                setGameTime(prev => {
                    const next = Math.max(0, prev - diff);
                    if (prev > 0 && next <= 0) {
                        setTimerRunning(false);
                        clearInterval(timerRef.current);
                        playBuzzer();
                        return 0;
                    }
                    return next;
                });
                setShotClock(prev => {
                    if (shotClockPaused) return prev;
                    const next = Math.max(0, prev - diff);
                    if (prev > 0 && next <= 0) {
                        playBuzzerShot();
                        return 0;
                    }
                    return next;
                });
            }, 50);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [timerRunning, shotClockPaused]);

    // ────────────────────────────────────────
    // 키보드 단축키 (라이브 기록 중에만 활성) — 좌우 분리 블라인드 조작
    // 실제 경기에서 고개 들었다놨다 하며 누락되는 문제 해결: 손가락 감각만으로 조작
    // 왼손=A팀 / 오른손=B팀 / 가운데=공통. 바탕화면 Scoreboard.jsx에는 영향 없음(독립 컴포넌트)
    // 매핑 v2: 득점 A/;(+1) S/L(+2) D/K(-1) · 파울 G/H · 타임아웃 V/N
    //          샷클락 J(리셋+재개) F(정지/재개 토글) · 게임클락 Space(시작/정지)
    //          부저 B · 시간 미세조정 방향키(←→ 샷클락)
    // 게임클락 ±1초 조정 단축키(↑↓)는 제거됨 — 게임클락 미세조정은 마우스(시간편집 모달)로만 (사장 요청 2026-08-20)
    // 게임클락 10:00 리셋(구 R, 구 버튼)도 완전 제거됨 — 사장 요청 2026-08-27
    // ────────────────────────────────────────
    useEffect(() => {
        if (!liveMatch) return;     // 라이브 모드에서만 동작
        if (showEditTime) return;   // 시간편집 모달 열려있으면 비활성
        if (showKbdGuide) return;   // 키보드 안내 오버레이 열려있으면 비활성

        const handleKey = (e) => {
            // 입력창 포커스 중엔 무시 (팀명/시간 입력 등)
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

            // ⚠️ e.code(물리 키 위치) 사용 — 한글 입력 상태/키보드 레이아웃과 무관하게 동작.
            //    e.key는 한글모드에서 'ㅂ'/'ㅈ'/'ㄹ' 또는 'Process'로 들어와 매칭 실패함.

            // ── 시간 +/- 조정 (방향키, 홀드 시 빠른 스크럽 허용) ──
            // 게임클락 ±1초(↑↓)는 마우스 전용으로 이관 — 여기 없음 (사장 요청 2026-08-20)
            switch (e.code) {
                case 'ArrowRight': // 샷클락 +1초
                    e.preventDefault(); setShotClockPaused(true);
                    setShotClock(s => Number((s + 1).toFixed(1))); return;
                case 'ArrowLeft':  // 샷클락 -1초
                    e.preventDefault(); setShotClockPaused(true);
                    setShotClock(s => Math.max(0, Number((s - 1).toFixed(1)))); return;
                default: break;
            }

            if (e.repeat) return;   // 이하 동작은 키 홀드 자동반복 차단 (점수 폭주 방지)

            // 매핑 테이블 v2 — 좌측 키=A팀 / 우측 키=B팀 / 가운데=공통 (의미 반전 방지 위해 전면 재정의)
            switch (e.code) {
                // ── 득점 ──
                case 'KeyA':      setTeamAScore(s => s + 1); break;              // A팀 +1
                case 'Semicolon': setTeamBScore(s => s + 1); break;             // B팀 +1
                case 'KeyS':      setTeamAScore(s => s + 2); break;             // A팀 +2
                case 'KeyL':      setTeamBScore(s => s + 2); break;             // B팀 +2
                case 'KeyD':      setTeamAScore(s => Math.max(0, s - 1)); break; // A팀 -1(정정)
                case 'KeyK':      setTeamBScore(s => Math.max(0, s - 1)); break; // B팀 -1(정정)

                // ── 파울 ──
                case 'KeyG':      setTeamAFouls(f => f + 1); break;             // A팀 파울 +1
                case 'KeyH':      setTeamBFouls(f => f + 1); break;             // B팀 파울 +1

                // ── 타임아웃 ──
                case 'KeyV':      setTeamATimeouts(prev => prev <= 0 ? defaultTimeouts() : prev - 1); break; // A팀
                case 'KeyN':      setTeamBTimeouts(prev => prev <= 0 ? defaultTimeouts() : prev - 1); break; // B팀

                // ── 공통 / 클락 ──
                case 'Space':     // 게임클락 시작/정지
                    e.preventDefault();
                    setTimerRunning(r => !r);
                    break;
                case 'KeyJ':      // 샷클락 12초 리셋 + 재개
                    setShotClock(12);
                    setShotClockPaused(false);
                    break;
                case 'KeyF':      // 샷클락 정지/재개 토글 (게임클락과 독립)
                    setShotClockPaused(p => !p);
                    break;
                // 게임클락 리셋(구 KeyR)은 완전 제거됨 — 사장 요청 2026-08-27
                case 'KeyB':      // 수동 부저
                    playBuzzer();
                    break;
                default: break;
            }
        };

        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [liveMatch, showEditTime, showKbdGuide]);

    // ── 키보드 안내 오버레이: 전광판(라이브) 첫 진입 시 대회당 1회 ──
    useEffect(() => {
        if (!liveMatch) { setShowKbdGuide(false); return; }
        const tid = liveMatch.tournament_id || 'local';
        const key = 'gritlab_kbd_guide_v1_' + tid;
        if (!localStorage.getItem(key)) setShowKbdGuide(true);
    }, [liveMatch]);

    const closeKbdGuide = () => {
        if (liveMatch) {
            const tid = liveMatch.tournament_id || 'local';
            localStorage.setItem('gritlab_kbd_guide_v1_' + tid, '1');
        }
        setShowKbdGuide(false);
    };

    // ── 대회 CRUD ──
    const handleCreateTournament = async () => {
        if (!newTitle.trim()) return;
        const { data } = await supabase
            .from('tournaments')
            .insert([{ title: newTitle.trim(), type: '3V3', status: 'ACTIVE' }])
            .select().single();
        if (data) {
            setTournaments(prev => [data, ...prev]);
            setActiveTournamentId(data.id);
            setNewTitle('');
        }
    };

    const handleToggleStatus = async () => {
        if (!activeTournamentId) return;
        const current = tournaments.find(t => t.id === activeTournamentId);
        if (!current) return;
        const newStatus = current.status === 'ACTIVE' ? 'ENDED' : 'ACTIVE';
        const { error } = await supabase
            .from('tournaments').update({ status: newStatus }).eq('id', activeTournamentId);
        if (error) { alert('상태 변경 실패: ' + error.message); return; }
        setTournaments(prev => prev.map(t => t.id === activeTournamentId ? { ...t, status: newStatus } : t));
    };

    // ── 경기 CRUD ──
    const handleAddMatch = async () => {
        if (!activeTournamentId) return;
        const roundMatches = allMatches.filter(m => m.round === activeRound);
        // count+1은 삭제로 생긴 번호 갭에서 기존 경기와 충돌 — max+1로 항상 유일하게
        const nextOrder = roundMatches.length ? Math.max(...roundMatches.map(m => m.match_order)) + 1 : 1;
        const { data, error } = await supabase
            .from('game_3v3_brackets')
            .insert([{
                tournament_id: activeTournamentId, round: activeRound, match_order: nextOrder,
                team_a_name: '', team_b_name: '', team_a_score: 0, team_b_score: 0, status: 'PENDING',
            }]).select().single();
        if (error) { alert('경기 추가 실패: ' + error.message); return; }
        if (data) setAllMatches(prev => [...prev, data]);
    };

    // 성공 여부를 반환한다 — saveLiveAndClose가 이 값으로 인터미션 진입을 게이트한다.
    const handleSaveMatch = async (match) => {
        // 3x3에는 무승부가 없다. 동점이 저장되면 winner=null·status 유지로 남아
        // 4강 자동 진행이 원인 표시 없이 멈춘다(BUG-007) → 결과성 동점 저장은 차단.
        // 0:0인 PENDING 저장(경기 전 팀명 입력)은 정상 흐름이므로 통과시킨다.
        if (match.team_a_score === match.team_b_score
            && (match.team_a_score > 0 || match.status === 'ENDED')) {
            alert('3x3은 무승부가 없습니다. 점수를 다시 확인하세요.\n(동점은 저장되지 않습니다)');
            return false;
        }
        setSaving(match.id);
        const winner = match.team_a_score > match.team_b_score ? 'A_WIN'
            : match.team_b_score > match.team_a_score ? 'B_WIN' : null;
        const { error } = await supabase
            .from('game_3v3_brackets')
            .update({
                team_a_name: match.team_a_name, team_b_name: match.team_b_name,
                team_a_score: match.team_a_score, team_b_score: match.team_b_score,
                winner, status: winner ? 'ENDED' : match.status, updated_at: new Date().toISOString(),
            }).eq('id', match.id);
        setSaving(null);
        if (error) { alert('저장 실패: ' + error.message); return false; }
        const next = allMatches.map(m => m.id === match.id ? { ...m, ...match, winner, status: winner ? 'ENDED' : m.status } : m);
        setAllMatches(next);
        maybeAutoFillBracket(next); // 마지막 예선/4강 종료 감지 → 대진 자동 완성
        maybeSuggestExtraGame(next); // 조별 승수 동률 감지 → 추가경기 만들기 제안
        return true;
    };

    // ── 대진 자동 완성: 예선 전부 종료 → 4강 시딩, 4강 전부 종료 → 결승 매치업 ──
    // 운영자가 이미 팀명을 넣어둔 row는 절대 덮어쓰지 않는다 (수동 편성 보호).
    const maybeAutoFillBracket = async (ms) => {
        if (!activeTournamentId || autoFillBusyRef.current) return;
        autoFillBusyRef.current = true;
        try {
            const groupGames = ms.filter(m => m.round?.startsWith('GROUP_') && m.team_a_name && m.team_b_name);
            const semiRows = ms.filter(m => m.round === 'SEMI').sort((a, b) => a.match_order - b.match_order);

            // 1) 예선 전부 종료 → 조 1위 동률 확인 + (SEMI가 비어있으면) 4강 시딩
            if (groupGames.length && groupGames.every(m => m.status === 'ENDED')) {
                const seeding = computePlayoffSeeding(ms, { size: 4 });
                // R6: 조 1위가 승수 동률이면 득실차로 임의 확정하지 않고 보류한다.
                // 추가경기(EXTRA)가 저장되면 handleSaveMatch가 이 함수를 다시 불러 자동으로 풀린다.
                // 보류 상태는 SEMI 편성 여부와 무관하게 갱신해야 배너가 해소 후 사라진다.
                const holding = !!seeding?.pendingTies?.length;
                setSeedingHold(holding ? { rounds: seeding.pendingTies, names: seeding.tiedNames || {}, kinds: seeding.tieKinds || {} } : null);
                setTieNotes(seeding?.tieNotes || []);
                if (holding) return;
                // 이미 편성된 SEMI는 덮어쓰지 않는다(수동 편성 보호) — 아래 2)로 흘려보낸다
                if (seeding && !semiRows.some(m => m.team_a_name || m.team_b_name)) {
                    const written = [];
                    for (let i = 0; i < 2; i++) {
                        const [a, b] = seeding.semis[i];
                        const row = semiRows[i];
                        if (row) {
                            const fields = { team_a_name: a.name, team_b_name: b.name, updated_at: new Date().toISOString() };
                            const { error } = await supabase.from('game_3v3_brackets').update(fields).eq('id', row.id);
                            if (error) { alert('4강 자동 시딩 실패: ' + error.message); return; }
                            written.push({ ...row, ...fields });
                        } else {
                            const { data, error } = await supabase.from('game_3v3_brackets').insert([{
                                tournament_id: activeTournamentId, round: 'SEMI', match_order: i + 1,
                                team_a_name: a.name, team_b_name: b.name,
                                team_a_score: 0, team_b_score: 0, status: 'PENDING',
                            }]).select().single();
                            if (error) { alert('4강 자동 시딩 실패: ' + error.message); return; }
                            written.push(data);
                        }
                    }
                    setAllMatches(prev => {
                        const ids = new Set(written.map(w => w.id));
                        return [...prev.filter(m => !ids.has(m.id)), ...written];
                    });
                    setAutoSemiInfo({ qualified: seeding.qualified, needsDraw: seeding.needsDraw });
                    return;
                }
            }

            // 2) 4강 2경기 전부 종료 + FINAL 비어있음 → 결승 매치업 채움
            const semiNamed = semiRows.filter(m => m.team_a_name && m.team_b_name);
            if (semiNamed.length === 2 && semiNamed.every(m => m.status === 'ENDED' && m.winner)) {
                const finalRow = ms.find(m => m.round === 'FINAL');
                if (finalRow && (finalRow.team_a_name || finalRow.team_b_name)) return; // 수동 편성 보호
                const winnerOf = m => (m.winner === 'A_WIN' ? m.team_a_name : m.team_b_name);
                const wa = winnerOf(semiNamed[0]), wb = winnerOf(semiNamed[1]);
                if (finalRow) {
                    const fields = { team_a_name: wa, team_b_name: wb, updated_at: new Date().toISOString() };
                    const { error } = await supabase.from('game_3v3_brackets').update(fields).eq('id', finalRow.id);
                    if (error) { alert('결승 자동 편성 실패: ' + error.message); return; }
                    setAllMatches(prev => prev.map(m => m.id === finalRow.id ? { ...m, ...fields } : m));
                } else {
                    const { data, error } = await supabase.from('game_3v3_brackets').insert([{
                        tournament_id: activeTournamentId, round: 'FINAL', match_order: 1,
                        team_a_name: wa, team_b_name: wb, team_a_score: 0, team_b_score: 0, status: 'PENDING',
                    }]).select().single();
                    if (error) { alert('결승 자동 편성 실패: ' + error.message); return; }
                    setAllMatches(prev => [...prev, data]);
                }
            }
        } finally {
            autoFillBusyRef.current = false;
        }
    };

    // 이후 라운드(SEMI/FINAL)에 이미 팀명이 확정됐는지 — 자동 시딩은 1회성이라
    // 그 뒤의 예선/4강 정정은 대진에 자동 반영되지 않는다 (BUG-006)
    const downstreamSeeded = (round) => {
        const downstream = round?.startsWith('GROUP_') ? 'SEMI' : round === 'SEMI' ? 'FINAL' : null;
        if (!downstream) return false;
        return allMatches.some(m => m.round === downstream && (m.team_a_name || m.team_b_name));
    };

    const handleDeleteMatch = async (match) => {
        if (!confirm('이 경기를 삭제하시겠습니까?')) return;
        // 이미 치러진 경기(ENDED)는 결과 보호 — 2단계 확인
        if (match.status === 'ENDED' && !confirm(`⚠️ 종료된 경기입니다.\n${match.team_a_name} ${match.team_a_score} : ${match.team_b_score} ${match.team_b_name}\n\n삭제하면 경기 기록이 영구히 사라지고 순위에서 제외됩니다. 정말 삭제할까요?`)) return;
        // 4강/결승 대진이 이미 이 결과 기준으로 확정된 경우 — 삭제해도 대진은 자동 재계산되지 않는다 (BUG-006)
        if (downstreamSeeded(match.round) && !confirm('⚠️ 이후 라운드 대진이 이미 이 경기 결과를 반영해 확정되어 있습니다.\n삭제해도 4강/결승 대진은 자동으로 다시 계산되지 않습니다.\n계속하면 해당 대진의 팀명이 맞는지 직접 확인·수정해야 합니다.\n\n계속 삭제할까요?')) return;
        setDeleting(match.id);
        const { error } = await supabase.from('game_3v3_brackets').delete().eq('id', match.id);
        if (error) { alert('삭제 실패: ' + error.message); }
        else { setAllMatches(prev => prev.filter(m => m.id !== match.id)); }
        setDeleting(null);
    };

    const updateMatch = (id, field, value) => {
        setAllMatches(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
    };

    // ── PR-F: ENDED 잠금 — 종료 경기는 잠금 해제(2단계 확인) 전까지 수정 불가 ──
    const isLocked = (match) => match.status === 'ENDED' && !unlockedIds.has(match.id);

    const toggleUnlock = (match) => {
        if (unlockedIds.has(match.id)) {
            setUnlockedIds(prev => { const s = new Set(prev); s.delete(match.id); return s; });
            return;
        }
        // BUG-006: "순위에 즉시 반영"만 안내하면 4강 대진도 갱신되는 걸로 오해한다 — 한계를 명시
        if (!confirm('⚠️ 종료된 경기의 잠금을 해제할까요?\n결과를 수정하면 순위(standings)에 즉시 반영됩니다.'
            + (downstreamSeeded(match.round)
                ? '\n\n단, 이미 확정된 4강/결승 대진은 자동으로 바뀌지 않습니다.\n수정 후 해당 대진의 팀명을 직접 확인하세요.'
                : ''))) return;
        setUnlockedIds(prev => new Set(prev).add(match.id));
    };

    // ── PR-F: 순서 변경 — ENDED 경기는 제자리 고정, PENDING끼리만 재배치 ──
    // changedOnly: match_order가 실제로 바뀐 row만 DB 갱신 (ENDED row 무변경 보장)
    const persistOrder = async (roundId, orderedList) => {
        const changes = orderedList
            .map((m, i) => ({ id: m.id, from: m.match_order, to: i + 1 }))
            .filter(c => c.from !== c.to);
        if (!changes.length) return;
        setAllMatches(prev => prev.map(m => {
            const c = changes.find(x => x.id === m.id);
            return c ? { ...m, match_order: c.to } : m;
        }));
        const results = await Promise.all(changes.map(c =>
            supabase.from('game_3v3_brackets')
                .update({ match_order: c.to, updated_at: new Date().toISOString() })
                .eq('id', c.id)
        ));
        if (results.some(r => r.error)) {
            alert('순서 저장 실패 — 목록을 다시 불러옵니다.');
            fetchMatches();
        }
    };

    // 라운드 내 정렬본에서 dragged를 target 위치로 이동시키되 ENDED는 슬롯 고정
    const reorderRound = (roundId, draggedId, targetId) => {
        const list = allMatches.filter(m => m.round === roundId).sort((a, b) => a.match_order - b.match_order);
        const dragged = list.find(m => m.id === draggedId);
        const target = list.find(m => m.id === targetId);
        if (!dragged || !target || dragged.status === 'ENDED' || target.status === 'ENDED') return;
        const pend = list.filter(m => m.status !== 'ENDED');
        const from = pend.findIndex(m => m.id === draggedId);
        const to = pend.findIndex(m => m.id === targetId);
        if (from === -1 || to === -1 || from === to) return;
        pend.splice(to, 0, pend.splice(from, 1)[0]);
        // ENDED는 원래 슬롯에 그대로, 나머지 슬롯을 새 PENDING 순서로 채움
        let pi = 0;
        const rebuilt = list.map(m => m.status === 'ENDED' ? m : pend[pi++]);
        persistOrder(roundId, rebuilt);
    };

    // ↑/↓ 버튼 — 인접 PENDING 경기와 교환 (ENDED는 건너뜀)
    const nudgeMatch = (match, dir) => {
        if (match.status === 'ENDED') return;
        const pend = allMatches
            .filter(m => m.round === match.round && m.status !== 'ENDED')
            .sort((a, b) => a.match_order - b.match_order);
        const idx = pend.findIndex(m => m.id === match.id);
        const neighbor = pend[idx + dir];
        if (!neighbor) return;
        reorderRound(match.round, match.id, neighbor.id);
    };

    // ── PR-F: 라운드(조) 이동 — 대상 라운드 맨 뒤로 ──
    const handleMoveRound = async (match, newRound) => {
        if (newRound === match.round) return;
        if (isLocked(match)) return;
        const targetLabel = ROUNDS.find(r => r.id === newRound)?.label || newRound;
        if (!confirm(`이 경기를 "${targetLabel}"(으)로 이동할까요?`)) return;
        const tgt = allMatches.filter(m => m.round === newRound);
        const newOrder = tgt.length ? Math.max(...tgt.map(m => m.match_order)) + 1 : 1;
        const { error } = await supabase.from('game_3v3_brackets')
            .update({ round: newRound, match_order: newOrder, updated_at: new Date().toISOString() })
            .eq('id', match.id);
        if (error) { alert('이동 실패: ' + error.message); return; }
        setAllMatches(prev => prev.map(m => m.id === match.id ? { ...m, round: newRound, match_order: newOrder } : m));
    };

    // ── PR-F: 몰수패 — 불참/기권 팀 0 : 20 상대팀 승, ENDED 처리 (FIBA 몰수 규정 준용) ──
    const applyForfeit = async (match, loser) => {
        const loserName = loser === 'A' ? match.team_a_name : match.team_b_name;
        const winnerName = loser === 'A' ? match.team_b_name : match.team_a_name;
        if (!confirm(`"${loserName}" 몰수패 처리할까요?\n\n${winnerName} 20 : 0 ${loserName} 승으로 기록되고 경기가 종료(ENDED)됩니다.`)) return;
        const fields = {
            team_a_score: loser === 'A' ? 0 : 20,
            team_b_score: loser === 'B' ? 0 : 20,
            winner: loser === 'A' ? 'B_WIN' : 'A_WIN',
            status: 'ENDED',
            updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('game_3v3_brackets').update(fields).eq('id', match.id);
        if (error) { alert('몰수패 처리 실패: ' + error.message); return; }
        const next = allMatches.map(m => m.id === match.id ? { ...m, ...fields } : m);
        setAllMatches(next);
        setForfeitTarget(null);
        maybeAutoFillBracket(next); // 몰수패가 마지막 예선/4강 경기일 수 있음
        maybeSuggestExtraGame(next); // 조별 승수 동률 감지 → 추가경기 만들기 제안
    };

    // ── 라이브 기록 시작 ──
    const startLiveRecord = (match, durationSec = 600) => {
        setLiveMatch(match);
        setTeamAScore(match.team_a_score || 0);
        setTeamBScore(match.team_b_score || 0);
        setTeamAFouls(0);
        setTeamBFouls(0);
        // 작전타임도 새 경기마다 리셋 (2026-09-03 제보 — 파울만 리셋되고 작전타임은 이전 경기 값이 이월됐다)
        setTeamATimeouts(defaultTimeouts());
        setTeamBTimeouts(defaultTimeouts());
        setGameTime(durationSec);
        setShotClock(12);
        setTimerRunning(false);
    };

    // ── 조별 동률 자동 감지 → 추가경기 만들기 팝업 제안 ──
    // 3x3은 무승부가 없어 "승수 동률"이 곧 순위 미확정 상태. 조의 모든 경기가 끝났는데
    // 최다승 팀이 정확히 2팀이면(3팀+ 동률은 애매해서 자동 제안 안 함) 타이브레이크를 제안.
    // 같은 조는 세션당 1회만 제안(경기 저장마다 재호출되므로 promptedTieGroupsRef로 중복 방지).
    const maybeSuggestExtraGame = (ms) => {
        const groupRounds = [...new Set(ms.filter(m => m.round?.startsWith('GROUP_')).map(m => m.round))];
        for (const round of groupRounds) {
            if (promptedTieGroupsRef.current.has(round)) continue;
            const games = ms.filter(m => m.round === round && m.team_a_name && m.team_b_name);
            if (!games.length || !games.every(m => m.status === 'ENDED')) continue;
            const rows = standingRowsFor(games);
            const clearTie = rows.length >= 2 && rows[0].w === rows[1].w && (!rows[2] || rows[2].w < rows[1].w);
            if (clearTie) {
                promptedTieGroupsRef.current.add(round);
                const label = ROUNDS.find(r => r.id === round)?.label || round;
                openExtraGameForm(round, rows[0].name, rows[1].name,
                    `${label}에서 ${rows[0].w}승 동률(${rows[0].name} · ${rows[1].name})이 발생했습니다. 타이브레이크 추가경기를 만드시겠습니까?`);
                break; // 여러 조가 동시에 걸려도 한 번에 하나씩만 — 나머지는 다음 저장 때 확인
            }
        }
    };

    // 조에 속한 팀명 목록(추가경기 팀 선택지) — game_3v3_brackets에 별도 팀 테이블이 없어 해당 조 경기의 팀명에서 도출
    const teamsInGroup = (round) => {
        const names = new Set();
        allMatches.filter(m => m.round === round).forEach(m => {
            if (m.team_a_name) names.add(m.team_a_name);
            if (m.team_b_name) names.add(m.team_b_name);
        });
        return [...names].sort();
    };

    const openExtraGameForm = (round = '', teamA = '', teamB = '', note = null) => {
        const groups = [...new Set(allMatches.filter(m => m.round?.startsWith('GROUP_')).map(m => m.round))].sort();
        setExtraGameGroup(round || groups[0] || '');
        setExtraTeamAName(teamA);
        setExtraTeamBName(teamB);
        setExtraGameAutoNote(note);
        setShowExtraGameForm(true);
    };

    const closeExtraGameForm = () => {
        setShowExtraGameForm(false);
        setExtraGameGroup('');
        setExtraTeamAName('');
        setExtraTeamBName('');
        setExtraGameAutoNote(null);
    };

    // ── 추가경기 생성 + 즉시 라이브 시작 (게임클락 3분 고정) ──
    // round:'EXTRA'는 ROUNDS 탭에도 없고 GROUP_*/SEMI/FINAL도 아니라서
    // standingRowsFor·maybeAutoFillBracket 양쪽 모두 자동으로 무시함(별도 예외처리 불필요).
    const createAndStartExtraGame = async () => {
        const a = extraTeamAName.trim(), b = extraTeamBName.trim();
        if (!a || !b) { alert('두 팀을 모두 선택하세요.'); return; }
        if (a === b) { alert('서로 다른 두 팀을 선택하세요.'); return; }
        if (!activeTournamentId) { alert('먼저 대회를 선택하세요.'); return; }
        const { data, error } = await supabase.from('game_3v3_brackets').insert([{
            tournament_id: activeTournamentId, round: 'EXTRA', match_order: 0,
            team_a_name: a, team_b_name: b, team_a_score: 0, team_b_score: 0, status: 'PENDING',
        }]).select().single();
        if (error) { alert('추가경기 생성 실패: ' + error.message); return; }
        setAllMatches(prev => [...prev, data]);
        closeExtraGameForm();
        startLiveRecord(data, 180); // 3분
    };

    // ── 대회 페이지(tournament.html)에서 경기 클릭 → 자동 기록시작 ──
    // tournament.html이 sessionStorage에 match id를 넣고 이 페이지로 이동시킨다.
    useEffect(() => {
        const mid = sessionStorage.getItem('gritlab_autostart_match');
        if (!mid || liveMatch || !allMatches.length) return;
        const m = allMatches.find(x => String(x.id) === String(mid));
        sessionStorage.removeItem('gritlab_autostart_match'); // 1회성 소비
        if (m) { setAdminMode('tournament'); startLiveRecord(m); } // 대시보드에서 진입 = 전광판 사이클(대회 모드)
    }, [allMatches]); // eslint-disable-line react-hooks/exhaustive-deps

    // 경기 진행/탐색용 정렬본 (예선 조 교차 — A1·B1·A2·B2…, 이후 본선)
    const orderedMatches = [...allMatches].sort(byPlayOrder);

    // ── 다음 경기 찾기: 진행 순서상 다음 PENDING(팀명 있는) 경기, 현재 제외 ──
    const findNextMatch = (currentId) => {
        return orderedMatches.find(m =>
            m.id !== currentId && m.status !== 'ENDED' && m.team_a_name && m.team_b_name
        ) || null;
    };

    // ── 라이브 기록 저장 → 인터미션(다음 경기 안내) ──
    const saveLiveAndClose = async () => {
        if (!liveMatch) return;
        // 3x3 무승부 없음 — 동점 상태로는 경기를 끝낼 수 없다 (승부 확정 후 종료)
        if (teamAScore === teamBScore) {
            alert('동점입니다. 3x3은 무승부가 없습니다 — 승부를 확정한 뒤 종료하세요.');
            return;
        }
        // 1) 저장 — 성공 시 handleSaveMatch가 목록 상태(allMatches)까지 갱신한다
        const updated = { ...liveMatch, team_a_score: teamAScore, team_b_score: teamBScore };
        const ok = await handleSaveMatch(updated);
        if (!ok) {
            // 저장 실패(네트워크 등) — 인터미션으로 넘어가면 라이브 화면의 점수가 사라진 채
            // 결과가 DB에 없는 상태가 된다. 라이브 화면을 유지해 재시도를 보장한다.
            // (실패 사유 alert는 handleSaveMatch가 이미 띄웠다)
            return;
        }
        setTimerRunning(false);
        // 2) 저장 성공 후 → 인터미션 화면으로 전환 (90초 카운트다운)
        setIntermissionNext(findNextMatch(liveMatch.id));
        setIntermissionSec(90);
        setIntermissionRunning(true);
        setLiveMatch(null);
        setShowIntermission(true);
    };

    // 인터미션 카운트다운 (1초 감소)
    useEffect(() => {
        if (!showIntermission || !intermissionRunning) return;
        const t = setInterval(() => setIntermissionSec(s => Math.max(0, s - 1)), 1000);
        return () => clearInterval(t);
    }, [showIntermission, intermissionRunning]);

    // 0초 도달(90초 경과) → 버저 + 카운트다운 정지. 자동 전환 없음 — '다음 경기 시작' 버튼 클릭으로만 전환.
    useEffect(() => {
        if (!showIntermission || intermissionSec !== 0) return;
        playBuzzer();
        setIntermissionRunning(false);
    }, [showIntermission, intermissionSec]); // eslint-disable-line react-hooks/exhaustive-deps

    // 인터미션 조별 순환 — 10초마다 다음 조 (90초 ÷ 10초 = 9슬롯). 1초 틱으로 잔여초 카운트도 함께 표시.
    // 일시정지 중에는 화면 고정, 카운트다운 종료 후에는 운영자가 시작 누를 때까지 계속 순환.
    useEffect(() => {
        if (!showIntermission) { setRotTick(0); return; }
        const explicitPause = !intermissionRunning && intermissionSec > 0;
        if (explicitPause) return;
        const t = setInterval(() => setRotTick(k => k + 1), 1000);
        return () => clearInterval(t);
    }, [showIntermission, intermissionRunning, intermissionSec > 0]); // eslint-disable-line react-hooks/exhaustive-deps

    // 인터미션의 실제 '다음 경기' — 저장 직후 4강 자동 시딩이 비동기로 끝나면 intermissionNext가
    // 스테일(null)일 수 있어, 현재 allMatches 기준 다음 PENDING 경기로 폴백한다
    const intermissionNextResolved = intermissionNext
        || orderedMatches.find(m => m.status !== 'ENDED' && m.team_a_name && m.team_b_name)
        || null;

    // 인터미션 제어 — 대회 모드에서 다음 경기가 없으면 모드 선택으로 (경기 목록 미노출)
    const startNextNow = () => {
        setShowIntermission(false);
        if (intermissionNextResolved) startLiveRecord(intermissionNextResolved);
        else if (adminMode === 'tournament') setAdminMode(null);
    };

    // ── 대회모드 진행 시작 — 인터미션(준비 화면)부터 (사장 결정: 도식대로 인터미션 → 점수판 → …) ──
    // 첫 인터미션도 일반 인터미션과 동일하게 1:30 카운트다운 (사장 0612 교정 — 00:00 시작 금지)
    const enterTournamentCycle = (ms) => {
        setAdminMode('tournament');
        const ordered = [...ms].sort(byPlayOrder);
        const nxt = ordered.find(m => m.status !== 'ENDED' && m.team_a_name && m.team_b_name) || null;
        setIntermissionNext(nxt);
        setIntermissionSec(nxt ? 90 : 0);      // 진행할 경기가 없으면(모든 경기 종료) 카운트다운 불필요
        setIntermissionRunning(!!nxt);
        setShowIntermission(true);
        document.documentElement.requestFullscreen?.().catch?.(() => {}); // 전체화면(TV 출력) — 미지원/거부 시 무시
    };

    // 대회 선택 → 해당 대회 경기 로드 → 사이클 진입 (state 반영을 기다리지 않고 직접 fetch)
    const selectTournamentAndEnter = async (tid) => {
        setActiveTournamentId(tid); // matches effect도 재로드되지만 동일 데이터라 무해
        const { data, error } = await supabase
            .from('game_3v3_brackets').select('*')
            .eq('tournament_id', tid)
            .order('round').order('match_order', { ascending: true });
        if (error) { alert('경기 목록 로드 실패: ' + error.message); return; }
        setAllMatches(data || []);
        enterTournamentCycle(data || []);
    };

    // 라이브 점수가 저장본과 다른지 (미저장 상태)
    const liveDirty = () => liveMatch && (teamAScore !== (liveMatch.team_a_score || 0) || teamBScore !== (liveMatch.team_b_score || 0));

    const closeLiveWithoutSave = () => {
        if (liveDirty() && !window.confirm('현재 경기 점수가 저장되지 않았습니다. 저장하지 않고 나갈까요?')) return;
        setTimerRunning(false);
        // 대회 모드: 경기 목록 대신 대기 화면으로 (카운트다운 없이 즉시 시작 가능 상태)
        if (adminMode === 'tournament') {
            setIntermissionNext(findNextMatch(liveMatch.id));
            setIntermissionSec(0);
            setIntermissionRunning(false);
            setShowIntermission(true);
        }
        setLiveMatch(null);
    };

    // 경기 간 순차 이동 (이전/다음). 미저장 라이브 점수가 있으면 확인 후 이동.
    const navigateToMatch = (target) => {
        if (!target || !liveMatch) return;
        if (liveDirty() && !window.confirm('현재 경기 점수가 저장되지 않았습니다. 저장하지 않고 이동할까요?')) return;
        setTimerRunning(false);
        startLiveRecord(target);
    };

    // ── PR-E2: 브라우저 전체화면 토글 (TV 출력 시 뷰포트 100% — vh/vw 기반이라 해상도 자동 적응) ──
    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
    };

    // ── PR-E2: 결과 대시보드(tournament.html)로 이동 — LIVE 미저장 확인 후 ──
    const goDashboard = () => {
        if (liveDirty() && !window.confirm('현재 경기 점수가 저장되지 않았습니다. 저장하지 않고 대시보드로 나갈까요?')) return;
        setTimerRunning(false);
        window.location.href = '/tournament.html';
    };

    const renderFoulDots = (fouls) => {
        const dots = [];
        const maxDots = 10;
        for (let i = 0; i < maxDots; i++) {
            const isFilled = i < fouls;
            let dotClass = '';
            if (isFilled) {
                if (i <= 2) dotClass = styles.dotActive;       // 1-3
                else if (i <= 5) dotClass = styles.dotWarning; // 4-6
                else if (i <= 8) dotClass = styles.dotPenalty; // 7-9
                else dotClass = styles.dotSevere;              // 10
            }
            dots.push(<div key={i} className={`${styles.foulIndicatorDot} ${dotClass}`} />);
        }
        return dots;
    };
    const activeTournament = tournaments.find(t => t.id === activeTournamentId);
    const bracketRounds = ROUNDS.filter(r => allMatches.some(m => m.round === r.id));
    const groupRoundsAvailable = [...new Set(allMatches.filter(m => m.round?.startsWith('GROUP_')).map(m => m.round))].sort();
    const shotClockLow = shotClock > 0 && shotClock < 5;

    if (loading || !authed) {
        return <div className="min-h-screen bg-[#16243f] flex items-center justify-center text-[#8ea0c2]" style={{ fontFamily: "'Anton', 'Pretendard', sans-serif" }}>Loading...</div>;
    }

    // ═══════════════════════════════════
    //  모드 선택 랜딩 (로그인 직후 진입점) — tournament.html 직행 없음. 큰 버튼 2개
    // ═══════════════════════════════════
    if (!adminMode) {
        // 대시보드 경기 클릭(autostart) 진입 중엔 게이트를 띄우지 않음 — 로드되면 곧장 전광판
        if (sessionStorage.getItem('gritlab_autostart_match')) {
            return <div className="min-h-screen bg-[#16243f] flex items-center justify-center text-[#8ea0c2]" style={{ fontFamily: "'Anton', 'Pretendard', sans-serif" }}>Loading...</div>;
        }
        const C = { navy: '#16243f', navy2: '#1d2e4d', line: '#33456a', cream: '#e9e1ca', orange: '#ee7c1b', green: '#34c13e', muted: '#7e90b3' };
        const anton = "'Anton', 'Pretendard', sans-serif";
        const pre = "'Pretendard', sans-serif";
        const modeBtn = {
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2vh',
            width: 'min(42vw, 480px)', minHeight: '34vh', padding: '6vh 2vw', borderRadius: 18, cursor: 'pointer',
            border: `3px solid ${C.line}`, background: C.navy2, color: C.cream, fontFamily: anton,
        };
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5vh', padding: '4vh 4vw',
                background: 'radial-gradient(120% 120% at 50% -10%, #1d2e4d 0%, #16243f 60%)', color: C.cream, fontFamily: anton }}>
                <img src="/gritlab-logo.png" alt="GRIT LAB" style={{ height: '10vh', objectFit: 'contain' }} />
                <div style={{ fontSize: '2.2vh', letterSpacing: '.34em', color: C.muted }}>3X3 ADMIN · 모드 선택</div>
                <div style={{ display: 'flex', gap: '3vw', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button onClick={() => { window.location.href = '/tournament.html'; }} style={modeBtn}>
                        <span style={{ fontSize: '6vh' }}>🛠</span>
                        <span style={{ fontSize: '4.2vh', letterSpacing: '.1em' }}>관리자모드</span>
                        <span style={{ fontFamily: pre, fontWeight: 500, fontSize: '1.9vh', color: C.muted }}>대회 빌드 · 토너먼트 컨트롤 (tournament.html)</span>
                    </button>
                    <button onClick={() => setAdminMode('select-tournament')}
                        style={{ ...modeBtn, border: `3px solid ${C.orange}` }}>
                        <span style={{ fontSize: '6vh' }}>🏀</span>
                        <span style={{ fontSize: '4.2vh', letterSpacing: '.1em', color: C.orange }}>대회모드</span>
                        <span style={{ fontFamily: pre, fontWeight: 500, fontSize: '1.9vh', color: C.muted }}>대회 선택 → 경기 일정대로 전광판 ↔ 대기화면 진행</span>
                    </button>
                </div>
                <div style={{ fontFamily: pre, fontSize: '1.7vh', color: C.muted }}>대회모드에서는 경기 목록·팀 명단·편집 화면이 노출되지 않습니다</div>
            </div>
        );
    }

    // ═══════════════════════════════════
    //  대회모드 — 대회 선택 (전체 + 상태 배지, ACTIVE 우선·종료 흐림)
    // ═══════════════════════════════════
    if (adminMode === 'select-tournament') {
        const C = { navy: '#16243f', navy2: '#1d2e4d', line: '#33456a', cream: '#e9e1ca', orange: '#ee7c1b', green: '#34c13e', muted: '#7e90b3' };
        const anton = "'Anton', 'Pretendard', sans-serif";
        const pre = "'Pretendard', sans-serif";
        const sorted = [...tournaments].sort((a, b) => (b.status === 'ACTIVE') - (a.status === 'ACTIVE')); // 안정 정렬 — 버킷 내 최신순 유지
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3vh', padding: '6vh 4vw',
                background: 'radial-gradient(120% 120% at 50% -10%, #1d2e4d 0%, #16243f 60%)', color: C.cream, fontFamily: anton }}>
                <div style={{ fontSize: '2.2vh', letterSpacing: '.34em', color: C.muted }}>대회모드 · 진행할 대회 선택</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6vh', width: 'min(720px, 92vw)', flex: 1 }}>
                    {sorted.length === 0 && (
                        <div style={{ fontFamily: pre, color: C.muted, textAlign: 'center', marginTop: '8vh' }}>
                            대회가 없습니다 — 관리자모드(대회 관리)에서 먼저 생성하세요.
                        </div>
                    )}
                    {sorted.map(t => {
                        const ended = t.status === 'ENDED';
                        return (
                            <button key={t.id} onClick={() => selectTournamentAndEnter(t.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '2.6vh 2vw', borderRadius: 14, textAlign: 'left',
                                    border: `2px solid ${ended ? C.line : C.orange}`, background: C.navy2, color: C.cream,
                                    cursor: 'pointer', opacity: ended ? .55 : 1, fontFamily: anton }}>
                                <span style={{ flex: 1, minWidth: 0, fontFamily: pre, fontWeight: 800, fontSize: '2.6vh', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                                <span style={{ fontFamily: pre, fontSize: '1.7vh', color: C.muted }}>{(t.created_at || '').slice(0, 10)}</span>
                                <span style={{ fontFamily: pre, fontWeight: 700, fontSize: '1.6vh', padding: '0.5vh 1vw', borderRadius: 999,
                                    background: ended ? 'transparent' : 'rgba(52,193,62,.15)', border: `1.5px solid ${ended ? C.line : C.green}`,
                                    color: ended ? C.muted : C.green }}>{ended ? '종료' : '진행중'}</span>
                            </button>
                        );
                    })}
                </div>
                <button onClick={() => setAdminMode(null)}
                    style={{ fontFamily: anton, fontSize: '2vh', letterSpacing: '.08em', padding: '1.6vh 3vw', border: `2px solid ${C.line}`, background: 'transparent', color: C.muted, cursor: 'pointer' }}>
                    ← 모드 선택
                </button>
            </div>
        );
    }

    // ═══════════════════════════════════
    //  인터미션 (경기 종료 후 다음 경기 안내 카운트다운) — GRIT LAB 3X3 톤
    // ═══════════════════════════════════
    if (showIntermission) {
        const mm = String(Math.floor(intermissionSec / 60)).padStart(2, '0');
        const ss = String(intermissionSec % 60).padStart(2, '0');
        const nx = intermissionNextResolved;
        const nxRound = nx ? (ROUNDS.find(r => r.id === nx.round)?.label || nx.round) : null;
        const C = { navy: '#16243f', navy2: '#1d2e4d', line: '#33456a', cream: '#e9e1ca', orange: '#ee7c1b', green: '#34c13e', muted: '#7e90b3' };
        const anton = "'Anton', 'Pretendard', sans-serif";
        const pre = "'Pretendard', sans-serif";
        const waiting = !!nx && intermissionSec > 0;   // 카운트다운 진행 중 = 시작 버튼 비활성

        // 조별 순위 집계 (allMatches GROUP_* — 원시값 정렬: 승수 → 득실차 → 다득점)
        const groupStandings = (() => {
            const groups = {};
            allMatches.filter(m => m.round && m.round.startsWith('GROUP_') && m.team_a_name && m.team_b_name).forEach(m => {
                const g = m.round; groups[g] = groups[g] || {};
                const ensure = nm => (groups[g][nm] = groups[g][nm] || { name: nm, w: 0, l: 0, pf: 0, pa: 0 });
                const A = ensure(m.team_a_name), B = ensure(m.team_b_name);
                if (m.status === 'ENDED') {
                    const sa = m.team_a_score || 0, sb = m.team_b_score || 0;
                    A.pf += sa; A.pa += sb; B.pf += sb; B.pa += sa;
                    if (sa > sb) { A.w++; B.l++; } else if (sb > sa) { B.w++; A.l++; }
                }
            });
            return Object.keys(groups).sort().map(g => ({
                round: g, label: ROUNDS.find(r => r.id === g)?.label || g,
                rows: Object.values(groups[g]).sort((x, y) => y.w - x.w || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf),
            }));
        })();
        // [PR-D 대체] 한 번에 한 조만 풀스크린 + 10초 순환 — 전 조 동시표시는 15m에서 글씨가 너무 작았음
        const bigThL = { padding: '0.6vh 1vw', textAlign: 'left', fontWeight: 600, color: C.muted, fontSize: '2.2vh', letterSpacing: '.08em' };
        const bigThR = { ...bigThL, textAlign: 'right' };
        const bigTd = { padding: '1.6vh 1vw', fontSize: '4.6vh', fontWeight: 700 };

        // 예선 전부 종료 + 4강 시딩 완료 → 순위표 대신 본선 브라켓을 보여준다 (사장 요청: 마지막 예선 후 대기 타임에 대진표)
        const groupGamesAll = allMatches.filter(m => m.round?.startsWith('GROUP_') && m.team_a_name && m.team_b_name);
        const groupsAllDone = groupGamesAll.length > 0 && groupGamesAll.every(m => m.status === 'ENDED');
        const semiMatches = allMatches.filter(m => m.round === 'SEMI' && m.team_a_name && m.team_b_name).sort((a, b) => a.match_order - b.match_order);
        const finalMatch = allMatches.find(m => m.round === 'FINAL' && m.team_a_name && m.team_b_name);
        const showBracket = groupsAllDone && semiMatches.length > 0;
        const qualOf = nm => autoSemiInfo?.qualified?.find(t => t.name === nm); // 진출 근거 배지 (자동시딩 직후에만)

        return (
            <div style={{ minHeight: '100vh', height: '100vh', display: 'flex', flexDirection: 'column', gap: '1.6vh', padding: '2vh 1.6vw',
                background: 'radial-gradient(120% 120% at 50% -10%, #1d2e4d 0%, #16243f 60%)', color: C.cream, fontFamily: anton, overflow: 'hidden' }}>

                {/* 상단: 카운트다운 + 다음 경기 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                        <span style={{ fontSize: '1.8vh', letterSpacing: '.3em', color: C.muted }}>{nx ? '다음 경기까지' : 'INTERMISSION'}</span>
                        <span style={{ fontFamily: pre, fontWeight: 800, fontSize: 'clamp(10vh, 7vw, 16vh)', lineHeight: .9, color: intermissionSec <= 10 ? C.orange : C.cream, fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</span>
                    </div>
                    {nx ? (
                        <div style={{ textAlign: 'right', minWidth: 0, maxWidth: '58%' }}>
                            <div style={{ fontSize: '1.6vh', letterSpacing: '.2em', color: C.orange, marginBottom: '0.5vh' }}>NEXT · {nxRound} · GAME {nx.match_order}</div>
                            <div style={{ fontFamily: pre, fontWeight: 800, fontSize: 'clamp(4vh, 3.2vw, 7vh)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {nx.team_a_name || '팀 A'} <span style={{ color: C.muted, fontWeight: 400, fontSize: '.7em' }}>vs</span> {nx.team_b_name || '팀 B'}
                            </div>
                        </div>
                    ) : (
                        <div style={{ fontFamily: pre, fontWeight: 800, fontSize: 'clamp(4vh, 3.2vw, 7vh)', color: C.orange }}>🏆 모든 경기 종료</div>
                    )}
                </div>

                {/* 중앙: 예선 종료 후엔 본선 브라켓, 그 전엔 조별 순위표 */}
                {showBracket ? (
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '2vh', justifyContent: 'center' }}>
                        <div style={{ textAlign: 'center', fontSize: '2.2vh', letterSpacing: '.3em', color: C.orange }}>
                            본선 대진 확정{autoSemiInfo?.needsDraw ? ' · ⚠️ 와일드카드 완전 동률 — 추첨 확인 필요' : ''}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2vh 2vw', flex: 1, minHeight: 0 }}>
                            {semiMatches.slice(0, 2).map((m, i) => (
                                <div key={m.id} style={{ border: `2px solid ${C.line}`, background: C.navy2, borderRadius: 12, padding: '3vh 2vw', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1.8vh', minWidth: 0 }}>
                                    <div style={{ fontSize: '2vh', letterSpacing: '.24em', color: C.orange }}>SEMIFINAL {i + 1}</div>
                                    {[[m.team_a_name, m.team_a_score, m.winner === 'A_WIN'], [m.team_b_name, m.team_b_score, m.winner === 'B_WIN']].map(([nm, sc, win], j) => {
                                        const q = qualOf(nm);
                                        return (
                                            <div key={j} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
                                                <div style={{ fontFamily: pre, fontWeight: 800, fontSize: 'clamp(3vh, 2.6vw, 5.5vh)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: m.status === 'ENDED' && !win ? C.muted : C.cream }}>
                                                    {nm}
                                                    {q && <span style={{ fontWeight: 600, fontSize: '1.6vh', color: q.via === 'win' ? C.green : C.orange, marginLeft: 10 }}>
                                                        {q.group.replace('GROUP_', '')}조 {q.rank}위{q.via === 'wc' ? ' · WC' : ''}
                                                    </span>}
                                                </div>
                                                {m.status === 'ENDED' && <div style={{ fontFamily: pre, fontWeight: 800, fontSize: '4vh', color: win ? C.green : C.muted, fontVariantNumeric: 'tabular-nums' }}>{sc}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                        <div style={{ border: `2px solid ${C.orange}`, background: C.navy2, borderRadius: 12, padding: '2vh 2vw', textAlign: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '1.8vh', letterSpacing: '.3em', color: C.orange, marginRight: 18 }}>FINAL</span>
                            <span style={{ fontFamily: pre, fontWeight: 800, fontSize: 'clamp(2.6vh, 2.2vw, 4.5vh)' }}>
                                {finalMatch
                                    ? <>{finalMatch.team_a_name} <span style={{ color: C.muted, fontWeight: 400 }}>vs</span> {finalMatch.team_b_name}</>
                                    : <span style={{ color: C.muted }}>4강 승자 vs 4강 승자</span>}
                            </span>
                        </div>
                    </div>
                ) : groupStandings.length > 0 ? (
                    (() => {
                        const gi = Math.floor(rotTick / 10) % groupStandings.length;
                        const rotRemain = 10 - (rotTick % 10); // 다음 조 전환까지 남은 초
                        const g = groupStandings[gi];
                        return (
                            <div key={g.round} className={styles.intermissionGroupFade}
                                style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 5vw', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.5vh', flexShrink: 0 }}>
                                    <span style={{ fontFamily: anton, fontSize: '7vh', color: C.orange, letterSpacing: '.06em' }}>{g.label}</span>
                                    {groupStandings.length > 1 && (
                                        <span style={{ fontFamily: pre, fontWeight: 700, fontSize: '2.4vh', color: C.muted, letterSpacing: '.2em' }}>
                                            <span style={{ fontSize: '1.8vh', fontWeight: 600, opacity: .7, marginRight: 14, fontVariantNumeric: 'tabular-nums' }}>{rotRemain}s</span>
                                            GROUP {gi + 1}/{groupStandings.length}
                                        </span>
                                    )}
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: pre, fontVariantNumeric: 'tabular-nums' }}>
                                    <thead><tr><th style={bigThL}>#</th><th style={bigThL}>팀</th><th style={bigThR}>승-패</th><th style={bigThR}>득점</th><th style={bigThR}>+/-</th></tr></thead>
                                    <tbody>
                                        {g.rows.map((r, i) => {
                                            const diff = r.pf - r.pa;
                                            return (
                                                <tr key={r.name} style={{ borderTop: `2px solid ${C.line}` }}>
                                                    <td style={{ ...bigTd, color: C.muted, width: '6vw' }}>{i + 1}</td>
                                                    <td style={{ ...bigTd, fontWeight: 800, fontSize: '5.2vh', maxWidth: '42vw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</td>
                                                    <td style={{ ...bigTd, textAlign: 'right' }}>{r.w}-{r.l}</td>
                                                    <td style={{ ...bigTd, textAlign: 'right', color: C.muted }}>{r.pf}</td>
                                                    <td style={{ ...bigTd, textAlign: 'right', fontWeight: 800, color: diff > 0 ? C.green : diff < 0 ? '#ff7a76' : C.muted }}>{diff > 0 ? '+' : ''}{diff}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()
                ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, letterSpacing: '.16em' }}>예선 결과가 아직 없습니다</div>
                )}

                {/* 하단: 진행자 제어 — 90초 경과 후에만 '다음 경기 시작' 활성화. 자동 전환 없음 */}
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 14 }}>
                        <button onClick={() => { setShowIntermission(false); setAdminMode(null); }}
                            title="대회모드 ⟷ 관리자모드 전환"
                            style={{ fontFamily: anton, fontSize: '2vh', letterSpacing: '.06em', padding: '1.4vh 2vw', border: `2px solid ${C.line}`, background: 'transparent', color: C.muted, cursor: 'pointer' }}>
                            모드 선택
                        </button>
                        {adminMode === 'tournament' && (
                            <button onClick={() => { setShowIntermission(false); setAdminMode('select-tournament'); }}
                                title="다른 대회로 전환"
                                style={{ fontFamily: anton, fontSize: '2vh', letterSpacing: '.06em', padding: '1.4vh 2vw', border: `2px solid ${C.line}`, background: 'transparent', color: C.muted, cursor: 'pointer' }}>
                                대회 선택
                            </button>
                        )}
                        {waiting && (
                            <button onClick={() => setIntermissionRunning(r => !r)}
                                style={{ fontFamily: anton, fontSize: '2vh', letterSpacing: '.06em', padding: '1.4vh 2vw', border: `2px solid ${C.line}`, background: 'transparent', color: C.cream, cursor: 'pointer' }}>
                                {intermissionRunning ? '❚❚ 일시정지' : '► 재개'}
                            </button>
                        )}
                        {waiting && (
                            <button onClick={startNextNow}
                                title="대기 시간을 건너뛰고 즉시 경기 시작"
                                style={{ fontFamily: anton, fontSize: '2vh', letterSpacing: '.06em', padding: '1.4vh 2vw', border: `2px solid ${C.green}`, background: 'transparent', color: C.green, cursor: 'pointer' }}>
                                ▶ 경기 바로 시작
                            </button>
                        )}
                        <button onClick={startNextNow} disabled={waiting}
                            style={{ fontFamily: anton, fontSize: '2.1vh', letterSpacing: '.06em', padding: '1.4vh 2.4vw', border: 'none',
                                background: waiting ? C.line : (nx ? C.green : C.orange), color: waiting ? C.muted : '#0c1a0e',
                                cursor: waiting ? 'not-allowed' : 'pointer', opacity: waiting ? .7 : 1 }}>
                            {!nx ? (adminMode === 'tournament' ? '모드 선택으로' : '관리 화면으로') : waiting ? '다음 경기 시작 (대기 중)' : '▶ 다음 경기 시작'}
                        </button>
                    </div>
                    {waiting && <div style={{ fontSize: '1.5vh', letterSpacing: '.12em', color: C.muted }}>대기 시간이 끝나면 시작 버튼이 활성화됩니다</div>}
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════
    //  라이브 스코어보드 (기존 전광판 디자인 재사용)
    // ═══════════════════════════════════
    if (liveMatch) {
        const roundLabel = liveMatch.round === 'EXTRA' ? '추가경기' : (ROUNDS.find(r => r.id === liveMatch.round)?.label || liveMatch.round);
        const timeIsLow  = gameTime > 0 && gameTime <= 30;
        const timeIsZero = gameTime <= 0;
        const gameEnded  = timerRunning ? false : timeIsZero && gameTime === 0 && teamAScore !== teamBScore; // 간단한 보호 장치
        const aWins      = teamAScore > teamBScore;
        const bWins      = teamBScore > teamAScore;
        const shotClockZero = shotClock <= 0;

        // 경기 간 순차 이동 대상 (팀명 있는 경기, round→match_order 순). 버튼/마우스 전용 — 키보드 매핑 없음.
        const navList = orderedMatches.filter(m => m.team_a_name && m.team_b_name);
        const navIdx = navList.findIndex(m => m.id === liveMatch.id);
        const prevMatch = navIdx > 0 ? navList[navIdx - 1] : null;
        const nextMatchNav = navIdx >= 0 && navIdx < navList.length - 1 ? navList[navIdx + 1] : null;

        return (
            <div className={`${styles.scoreboard} ${gameEnded ? styles.ended : timerRunning ? styles.live : ''} ${shotClockZero && !gameEnded ? styles.shotClockExpiredBg : ''}`}>
                {/* 배경 */}
                <div className={styles.bgCourt} />
                <div className={styles.bgGrain} />
                {timeIsLow && !timeIsZero && <div className={styles.dangerPulse} />}
                {gameEnded && <div className={styles.endedOverlayGlow} />}

                {/* 헤더 */}
                <header className={styles.header}>
                    <div className={styles.headerLeft}>
                        <button className={styles.iconBtn} onClick={closeLiveWithoutSave} data-tooltip="경기 목록으로">
                            <ArrowLeft size={20} />
                        </button>
                        <button className={styles.iconBtn} onClick={() => navigateToMatch(prevMatch)} disabled={!prevMatch}
                            title={prevMatch ? `이전 경기: ${prevMatch.team_a_name} vs ${prevMatch.team_b_name}` : '이전 경기 없음'}
                            style={!prevMatch ? { opacity: .3, cursor: 'not-allowed' } : undefined}>
                            <ChevronLeft size={20} />
                        </button>
                        <button className={styles.iconBtn} onClick={() => navigateToMatch(nextMatchNav)} disabled={!nextMatchNav}
                            title={nextMatchNav ? `다음 경기: ${nextMatchNav.team_a_name} vs ${nextMatchNav.team_b_name}` : '다음 경기 없음'}
                            style={!nextMatchNav ? { opacity: .3, cursor: 'not-allowed' } : undefined}>
                            <ChevronRight size={20} />
                        </button>
                        <div className={styles.sessionLabel}>
                            <span className={styles.sessionLabelTag}>{roundLabel}</span>
                            <span className={styles.sessionLabelText} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>GAME {liveMatch.match_order} <span style={{ color: '#ef4444', fontSize: 11 }}>● REC</span></span>
                        </div>
                    </div>

                    <div className={styles.periodBadge} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {/* 텍스트 84px 고정 렌더링은 화면 폭에 따라 잘림 — 로고 이미지(고정 비율 축소)로 교체 */}
                        <img src="/gritlab-logo.png" alt="GRIT LAB"
                            style={{ height: 'clamp(44px, 8vh, 96px)', width: 'auto', maxWidth: '46vw', objectFit: 'contain', display: 'block' }} />
                    </div>

                    <div className={styles.headerRight}>
                        <button className={styles.iconBtn} onClick={goDashboard} data-tooltip="결과 대시보드로 (미저장 시 확인)">
                            <LayoutDashboard size={20} />
                        </button>
                        <button className={styles.iconBtn} onClick={toggleFullscreen} data-tooltip="전체화면 (TV 출력)">
                            <Maximize2 size={20} />
                        </button>
                        <button className={styles.iconBtn} onClick={() => setShowKbdGuide(true)} data-tooltip="키보드 조작 안내">
                            <Keyboard size={20} />
                        </button>
                        <button className={styles.iconBtn} onClick={() => setSidesSwapped(s => !s)} data-tooltip="팀 좌우 화면 반전">
                            <ArrowLeftRight size={20} />
                        </button>
                        <button className={styles.iconBtn} onClick={playBuzzer} data-tooltip="수동 부저">
                            <BellRing size={20} />
                        </button>
                        <button className={`${styles.iconBtn} ${styles.saveBtn}`} onClick={saveLiveAndClose} data-tooltip="저장 & 종료">
                            <Save size={20} />
                        </button>
                    </div>
                </header>

                {/* 메인 스코어보드 */}
                <main className={styles.main}>
                    {/* 팀 A */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, order: sidesSwapped ? 2 : 0 }}>
                    <div className={`${styles.teamBlock} ${aWins && gameEnded ? styles.winner : ''}`} style={{ '--team-color': '#fff' }}>
                        <div className={styles.teamHeaderRow}>
                            <div className={styles.teamNameWrap}>
                                <div className={styles.teamNameRow}>
                                    <h2 className={styles.teamNameHuge} style={{ '--name-len': Math.max(4, (liveMatch.team_a_name || '팀 A').length) }}>
                                        {liveMatch.team_a_name || '팀 A'}
                                    </h2>
                                </div>
                                {aWins && gameEnded && <span className={styles.winTag}>WINNER</span>}
                            </div>
                        </div>

                        <div className={styles.scoreWrap}>
                            <div className={`${styles.scoreGiant} ${timeIsLow && !timeIsZero ? styles.scorePulse : ''}`}
                                onClick={() => setTeamAScore(s => s + 1)}>
                                {teamAScore}
                            </div>
                            <div className={styles.scoreControlsVertical}>
                                <button className={styles.scoreBtnMicro} onClick={(e) => { e.stopPropagation(); setTeamAScore(s => s + 1); }}><Plus size={18} /></button>
                                <button className={styles.scoreBtnMicro} onClick={(e) => { e.stopPropagation(); setTeamAScore(s => Math.max(0, s - 1)); }}><Minus size={18} /></button>
                            </div>
                        </div>

                        <div className={styles.foulWrap}>
                            <div className={styles.foulLabel}>TEAM FOULS</div>
                            <div className={styles.foulControlsRow}>
                                <button className={styles.scoreBtnMicro} style={{ width: 32, height: 32 }} onClick={(e) => { e.stopPropagation(); setTeamAFouls(f => Math.max(0, f - 1)); }}><Minus size={14} /></button>
                                <div className={styles.foulDotsContainer} onClick={() => setTeamAFouls(f => f + 1)} style={{ cursor: 'pointer' }}>
                                    {renderFoulDots(teamAFouls)}
                                </div>
                                <button className={styles.scoreBtnMicro} style={{ width: 32, height: 32 }} onClick={(e) => { e.stopPropagation(); setTeamAFouls(f => f + 1); }}><Plus size={14} /></button>
                            </div>
                            {teamAFouls >= 7 && <div className={styles.penaltyBadge}>PENALTY</div>}
                        </div>
                    </div>
                    {/* T.O OUTSIDE teamBlock */}
                    <div className={styles.timeoutWrap} style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center', cursor: 'pointer' }}
                         onClick={(e) => { e.stopPropagation(); setTeamATimeouts(prev => prev <= 0 ? defaultTimeouts() : prev - 1); }}>
                        <span className={styles.foulLabel} style={{ marginTop: 0, marginBottom: 0 }}>Timeout</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {Array.from({ length: Math.max(1, defaultTimeouts()) }, (_, i) => (
                                <div key={i} className={`${styles.timeoutBall} ${i >= teamATimeouts ? styles.timeoutBallUsed : ''}`}>🏀</div>
                            ))}
                        </div>
                    </div>
                    </div>

                    {/* 중앙: 타이머 & 샷클락 (좌우 반전 시에도 항상 가운데) */}
                    <div className={styles.centerBlock} style={{ order: 1 }}>
                        <div className={styles.timerGroup}>
                            <p className={styles.timerLabel}>GAME CLOCK</p>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                {/* PR-B: 게임클락 마우스 ±버튼 제거 — 시간조정은 키보드 ↑↓ 또는 길게눌러 편집 모달 */}
                                <div
                                    className={`${styles.timerGiant} ${timeIsLow && !timeIsZero ? styles.timerDanger : ''} ${timeIsZero ? styles.timerZero : ''}`}
                                    {...gameClockHandlers}
                                    style={{ cursor: 'pointer', margin: 0, lineHeight: 1 }}
                                >
                                    {formatTime(gameTime)}
                                </div>
                                {/* 게임클락 10:00 리셋 버튼 완전 제거됨 — 사장 요청 2026-08-27 */}
                            </div>
                        </div>

                        <div className={styles.shotClockGroup}>
                            <p className={styles.timerLabel}>SHOT CLOCK{shotClockPaused ? <span style={{ color: '#ee7c1b' }}> · 정지(F)</span> : ''}</p>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                {shotClock < 10 ? (
                                    <div style={{ display: 'flex', gap: 8, position: 'relative', zIndex: 10 }}>
                                        <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 73, height: 34, cursor: 'pointer', transition: 'all 0.2s' }}
                                            onClick={(e) => { e.stopPropagation(); setShotClockPaused(true); setShotClock(s => Number((s + 1).toFixed(1))); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); }}>
                                            <ChevronsUp size={28} />
                                        </button>
                                        <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 73, height: 34, cursor: 'pointer', transition: 'all 0.2s' }}
                                            onClick={(e) => { e.stopPropagation(); setShotClockPaused(true); setShotClock(s => Number((s + 0.1).toFixed(1))); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); }}>
                                            <ChevronUp size={28} />
                                        </button>
                                    </div>
                                ) : (
                                    <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 83, height: 34, cursor: 'pointer', transition: 'all 0.2s', position: 'relative', zIndex: 10 }}
                                        onClick={(e) => { e.stopPropagation(); setShotClockPaused(true); setShotClock(s => s + 1); }}
                                        onTouchEnd={(e) => { e.stopPropagation(); }}>
                                        <ChevronUp size={32} />
                                    </button>
                                )}
                                <div
                                    className={`${styles.shotClockGiant} ${shotClockZero ? styles.timerDanger : ''} ${shotClockLow ? styles.shotClockDanger : ''}`}
                                    {...shotClockHandlers}
                                    style={{ cursor: 'pointer', opacity: shotClockPaused ? 0.6 : 1, margin: 0, lineHeight: 1 }}
                                >
                                    {formatShotClock(shotClock)}
                                </div>
                                {shotClock <= 10 ? (
                                    <div style={{ display: 'flex', gap: 8, position: 'relative', zIndex: 10 }}>
                                        <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 73, height: 34, cursor: 'pointer', transition: 'all 0.2s' }}
                                            onClick={(e) => { e.stopPropagation(); setShotClockPaused(true); setShotClock(s => Math.max(0, Number((s - 1).toFixed(1)))); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); }}>
                                            <ChevronsDown size={28} />
                                        </button>
                                        <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 73, height: 34, cursor: 'pointer', transition: 'all 0.2s' }}
                                            onClick={(e) => { e.stopPropagation(); setShotClockPaused(true); setShotClock(s => Math.max(0, Number((s - 0.1).toFixed(1)))); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); }}>
                                            <ChevronDown size={28} />
                                        </button>
                                    </div>
                                ) : (
                                    <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 83, height: 34, cursor: 'pointer', transition: 'all 0.2s', position: 'relative', zIndex: 10 }}
                                        onClick={(e) => { e.stopPropagation(); setShotClockPaused(true); setShotClock(s => Math.max(0, s - 1)); }}
                                        onTouchEnd={(e) => { e.stopPropagation(); }}>
                                        <ChevronDown size={32} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {gameEnded && <div className={styles.endedLabel}>MATCH FINISHED</div>}
                    </div>

                    {/* 팀 B */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, order: sidesSwapped ? 0 : 2 }}>
                    <div className={`${styles.teamBlock} ${styles.teamBlockLight} ${bWins && gameEnded ? styles.winner : ''}`} style={{ '--team-color': '#aaaaaa' }}>
                        <div className={styles.teamHeaderRow}>
                            <div className={styles.teamNameWrap}>
                                <div className={`${styles.teamNameRow} ${styles.teamNameRowLight}`}>
                                    <h2 className={`${styles.teamNameHuge} ${styles.teamNameHugeLight}`} style={{ '--name-len': Math.max(4, (liveMatch.team_b_name || '팀 B').length) }}>
                                        {liveMatch.team_b_name || '팀 B'}
                                    </h2>
                                </div>
                                {bWins && gameEnded && <span className={styles.winTag}>WINNER</span>}
                            </div>
                        </div>

                        <div className={styles.scoreWrap}>
                            <div className={`${styles.scoreGiant} ${timeIsLow && !timeIsZero ? styles.scorePulse : ''}`}
                                onClick={() => setTeamBScore(s => s + 1)}>
                                {teamBScore}
                            </div>
                            <div className={styles.scoreControlsVertical}>
                                <button className={styles.scoreBtnMicro} onClick={(e) => { e.stopPropagation(); setTeamBScore(s => s + 1); }}><Plus size={18} /></button>
                                <button className={styles.scoreBtnMicro} onClick={(e) => { e.stopPropagation(); setTeamBScore(s => Math.max(0, s - 1)); }}><Minus size={18} /></button>
                            </div>
                        </div>

                        <div className={styles.foulWrap}>
                            <div className={styles.foulLabel}>TEAM FOULS</div>
                            <div className={styles.foulControlsRow}>
                                <button className={styles.scoreBtnMicro} style={{ width: 32, height: 32 }} onClick={(e) => { e.stopPropagation(); setTeamBFouls(f => Math.max(0, f - 1)); }}><Minus size={14} /></button>
                                <div className={styles.foulDotsContainer} onClick={() => setTeamBFouls(f => f + 1)} style={{ cursor: 'pointer' }}>
                                    {renderFoulDots(teamBFouls)}
                                </div>
                                <button className={styles.scoreBtnMicro} style={{ width: 32, height: 32 }} onClick={(e) => { e.stopPropagation(); setTeamBFouls(f => f + 1); }}><Plus size={14} /></button>
                            </div>
                            {teamBFouls >= 7 && <div className={styles.penaltyBadge}>PENALTY</div>}
                        </div>
                    </div>
                    {/* T.O OUTSIDE teamBlock */}
                    <div className={styles.timeoutWrap} style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center', cursor: 'pointer' }}
                         onClick={(e) => { e.stopPropagation(); setTeamBTimeouts(prev => prev <= 0 ? defaultTimeouts() : prev - 1); }}>
                        <span className={styles.foulLabel} style={{ marginTop: 0, marginBottom: 0 }}>Timeout</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {Array.from({ length: Math.max(1, defaultTimeouts()) }, (_, i) => (
                                <div key={i} className={`${styles.timeoutBall} ${i >= teamBTimeouts ? styles.timeoutBallUsed : ''}`}>🏀</div>
                            ))}
                        </div>
                    </div>
                    </div>
                </main>

                {/* 키보드 단축키 안내 (대회당 1회) */}
                {showKbdGuide && <KeyboardGuide onClose={closeKbdGuide} />}

                {/* 롱프레스 모달: 시간 설정 */}
                {showEditTime && (
                    <div className={styles.setupPanel} onClick={() => setShowEditTime(false)}>
                        <div className={styles.setupPanelInner} onClick={e => e.stopPropagation()}>
                            <h3 className={styles.setupPanelTitle}>타이머 시간 설정</h3>
                            <div className={styles.newSessionForm} style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                <input type="number" className={styles.setupInput} style={{ width: 60 }} value={tempMins} onChange={e => setTempMins(parseInt(e.target.value)||0)} />
                                <span style={{ color: 'white' }}>분</span>
                                <input type="number" className={styles.setupInput} style={{ width: 60 }} value={tempSecs} onChange={e => setTempSecs(parseInt(e.target.value)||0)} />
                                <span style={{ color: 'white' }}>초</span>
                                <input type="number" className={styles.setupInput} style={{ width: 60 }} value={tempMsec} onChange={e => setTempMsec(parseInt(e.target.value)||0)} />
                                <span style={{ color: 'white' }}>.x초</span>
                                <button className={styles.setupCreateBtn} onClick={() => {
                                    const totalSecs = (parseInt(tempMins)||0)*60 + (parseInt(tempSecs)||0) + (parseInt(tempMsec)||0)*0.1;
                                    if (editTarget === 'GAME') setGameTime(totalSecs);
                                    else setShotClock(totalSecs);
                                    setShowEditTime(false);
                                }}>
                                    확인
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ═══════════════════════════════════
    //  메인 Admin 뷰
    // ═══════════════════════════════════
    return (
        <div className="min-h-screen bg-[#16243f] text-[#e9e1ca]" style={{ fontFamily: "'Anton', 'Pretendard', sans-serif", background: 'radial-gradient(120% 120% at 50% -10%, #1d2e4d 0%, #16243f 60%)' }}>
            {/* Header */}
            <header className="border-b-2 border-[#33456a] px-6 py-4 flex items-center justify-between bg-[#16243f]/85 backdrop-blur sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <button onClick={() => setAdminMode(null)} className="text-[#8ea0c2] hover:text-[#e9e1ca] transition" title="모드 선택으로">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-xl tracking-[0.06em]">
                        <span className="text-[#ee7c1b]">GRIT LAB</span> 3:3 ADMIN
                    </h1>
                    <button onClick={() => { window.location.href = '/tournament.html'; }}
                        className="flex items-center gap-2 px-4 py-2 text-sm tracking-wider text-[#8ea0c2] hover:text-[#e9e1ca] border-2 border-[#33456a] hover:border-[#ee7c1b] transition"
                        title="대회 결과 대시보드 (Standing · All Games · Bracket)">
                        <LayoutDashboard size={16} /> 대시보드
                    </button>
                </div>

                {activeTournament && (
                    <button
                        onClick={handleToggleStatus}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm tracking-wider transition ${
                            activeTournament.status === 'ACTIVE'
                                ? 'bg-[#d8302c]/20 text-[#f3b0ae] hover:bg-[#d8302c]/30 border border-[#d8302c]/40'
                                : 'bg-[#34c13e]/20 text-[#9be3a3] hover:bg-[#34c13e]/30 border border-[#34c13e]/40'
                        }`}
                    >
                        <Power size={16} />
                        {activeTournament.status === 'ACTIVE' ? '대회 종료' : '대회 재개'}
                    </button>
                )}
            </header>

            {/* 네트워크/조회 실패 배너 — 화면의 데이터가 최신이 아닐 수 있음을 명시 (NEW-02) */}
            {netError && (
                <div className="max-w-5xl mx-auto mt-4 px-6">
                    <div className="flex items-center justify-between gap-4 bg-[#d8302c]/15 border-2 border-[#d8302c]/60 px-5 py-3 text-[#f3b0ae]">
                        <span className="text-sm">
                            ⚠️ {netError.scope} 불러오기 실패 — 화면의 데이터는 마지막으로 성공한 조회 기준입니다.
                            네트워크를 확인하세요. ({netError.message})
                        </span>
                        <button
                            onClick={() => { fetchTournaments(); if (activeTournamentId) fetchMatches(); }}
                            className="shrink-0 px-4 py-2 text-sm border-2 border-[#d8302c]/60 hover:bg-[#d8302c]/25 transition"
                        >다시 시도</button>
                    </div>
                </div>
            )}

            <div className="max-w-5xl mx-auto p-6 space-y-6">

                {/* 대회 선택 / 생성 */}
                <section className="bg-[#1d2e4d] border-2 border-[#33456a] p-6 space-y-4">
                    <h2 className="text-base text-[#e9e1ca] uppercase tracking-[0.18em]">대회 관리</h2>

                    <div className="flex gap-3">
                        <input
                            className="flex-1 bg-[#16243f] border-2 border-[#33456a] px-4 py-3 text-[#e9e1ca] placeholder-[#6d7fa3] focus:outline-none focus:border-[#ee7c1b] transition"
                            placeholder="새 3v3 대회명 (예: 2026.03 GritLab 3:3)"
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateTournament()}
                        />
                        <button onClick={handleCreateTournament}
                            className="bg-[#ee7c1b] hover:brightness-110 text-white px-5 py-3 flex items-center gap-2 tracking-wider transition">
                            <Plus size={16} /> 생성
                        </button>
                    </div>

                    {tournaments.length > 0 && (
                        <div className="relative">
                            <select
                                className="w-full appearance-none bg-[#16243f] border-2 border-[#33456a] px-4 py-3 pr-10 text-[#e9e1ca] focus:outline-none focus:border-[#ee7c1b] transition cursor-pointer"
                                value={activeTournamentId || ''}
                                onChange={e => setActiveTournamentId(Number(e.target.value))}
                            >
                                {tournaments.map(t => (
                                    <option key={t.id} value={t.id} className="bg-[#16243f]">
                                        {t.type === '3V3' ? '[3v3] ' : ''}{t.title} {t.status === 'ACTIVE' ? '(진행중)' : '(종료)'}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8ea0c2] pointer-events-none" />
                        </div>
                    )}

                    {activeTournament && (
                        <div className="flex items-center gap-3 text-sm">
                            <div className={`w-2 h-2 rounded-full ${activeTournament.status === 'ACTIVE' ? 'bg-[#34c13e] animate-pulse' : 'bg-[#d8302c]'}`} />
                            <span className="text-[#8ea0c2]">
                                {activeTournament.title} — <strong className={activeTournament.status === 'ACTIVE' ? 'text-[#34c13e]' : 'text-[#f3b0ae]'}>
                                    {activeTournament.status === 'ACTIVE' ? '진행중' : '종료됨'}
                                </strong>
                            </span>
                        </div>
                    )}
                </section>

                {/* 라운드 탭 + 경기 관리 */}
                {activeTournamentId && (
                    <section className="bg-[#1d2e4d] border-2 border-[#33456a] p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base text-[#e9e1ca] uppercase tracking-[0.18em]">경기 관리</h2>
                            <div className="flex gap-2">
                                <button onClick={() => openExtraGameForm()}
                                    className="bg-[#16243f] hover:border-[#ee7c1b] border-2 border-[#33456a] text-[#e9e1ca] text-sm px-4 py-2 flex items-center gap-2 tracking-wider transition"
                                    title="조별 동률 등 타이브레이크용 — 3분 단판, 순위 집계에 반영 안 됨">
                                    <Plus size={14} /> 추가경기 만들기
                                </button>
                                <button onClick={handleAddMatch}
                                    className="bg-[#16243f] hover:border-[#ee7c1b] border-2 border-[#33456a] text-[#e9e1ca] text-sm px-4 py-2 flex items-center gap-2 tracking-wider transition">
                                    <Plus size={14} /> 경기 추가
                                </button>
                            </div>
                        </div>

                        {/* R6 — 조 1위 승수 동률로 본선 시딩 보류 중. 득실차로 임의 확정하지 않는다는 사실을 운영자에게 알림 */}
                        {seedingHold?.rounds?.length > 0 && (
                            <div className="border-2 border-[#ee7c1b] bg-[#ee7c1b]/10 p-4 space-y-2">
                                <div className="text-sm text-[#ee7c1b] font-bold">⚠️ 본선 대진 자동 생성 보류 중</div>
                                {seedingHold.rounds.map(r => {
                                    const label = ROUNDS.find(x => x.id === r)?.label || r;
                                    const names = seedingHold.names?.[r] || [];
                                    const twoWay = names.length === 2;
                                    return (
                                        <div key={r} className="flex items-center justify-between gap-3 flex-wrap">
                                            <span className="text-xs text-[#e9e1ca]">
                                                {label} 1위가 {names.length || 2}팀 승수 동률{names.length ? ` (${names.join(' · ')})` : ''} —
                                                {twoWay ? ' 추가경기로 승자를 가리면 대진이 자동 생성됩니다.'
                                                        : ' 득실차·득점까지 완전히 같아 순위를 정할 근거가 없습니다. 추가경기로 가리거나 4강 대진을 직접 입력하세요.'}
                                            </span>
                                            {twoWay && (
                                                <button
                                                    onClick={() => openExtraGameForm(r, names[0], names[1],
                                                        `${label} 1위 동률(${names.join(' · ')})을 가리는 추가경기입니다.`)}
                                                    className="bg-[#ee7c1b] hover:brightness-110 text-white text-xs px-3 py-2 flex items-center gap-2 tracking-wider transition shrink-0">
                                                    <Plus size={12} /> 추가경기 만들기
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* 3팀 순환 동률을 득실차로 정렬한 경우 — 막지는 않고 근거만 알린다 (R6) */}
                        {tieNotes.length > 0 && (
                            <div className="border border-[#33456a] bg-[#16243f] p-3 space-y-1">
                                {tieNotes.map(n => (
                                    <div key={n.round} className="text-xs text-[#8ea0c2]">
                                        ℹ️ {ROUNDS.find(x => x.id === n.round)?.label || n.round} 1위가 {n.names.length}팀 승수 동률
                                        {n.names.length ? ` (${n.names.join(' · ')})` : ''} — 맞대결이 순환이라
                                        <span className="text-[#e9e1ca]"> 득실차 → 다득점</span> 순으로 정렬했습니다.
                                        다르게 정하시려면 추가경기를 만들거나 4강 대진을 직접 입력하세요.
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {ROUNDS.map(r => {
                                const count = allMatches.filter(m => m.round === r.id).length;
                                return (
                                    <button key={r.id} onClick={() => setActiveRound(r.id)}
                                        className={`px-4 py-2 text-sm whitespace-nowrap tracking-wider transition ${
                                            activeRound === r.id ? 'bg-[#ee7c1b] text-white' : 'bg-[#16243f] text-[#8ea0c2] hover:text-[#e9e1ca]'
                                        }`}>
                                        {r.label} {count > 0 && <span className="ml-1 text-xs opacity-70">({count})</span>}
                                    </button>
                                );
                            })}
                        </div>

                        {/* 경기 카드 */}
                        <div className="space-y-3">
                            {matches.length === 0 ? (
                                <div className="text-center text-[#8ea0c2] py-12 border-2 border-dashed border-[#33456a]">
                                    이 라운드에 등록된 경기가 없습니다.
                                </div>
                            ) : (
                                matches.map((match) => {
                                    const locked = isLocked(match);
                                    const draggable = match.status !== 'ENDED';
                                    return (
                                    <div key={match.id}
                                        onDragOver={(e) => { if (dragId && dragId !== match.id && draggable) { e.preventDefault(); setDragOverId(match.id); } }}
                                        onDragLeave={() => setDragOverId(prev => (prev === match.id ? null : prev))}
                                        onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== match.id) reorderRound(match.round, dragId, match.id); setDragId(null); setDragOverId(null); }}
                                        className={`bg-[#e9e1ca] border-2 p-4 space-y-3 transition ${dragOverId === match.id ? 'border-[#ee7c1b]' : 'border-[#33456a]'} ${dragId === match.id ? 'opacity-50' : ''}`}>
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {draggable ? (
                                                    <span draggable
                                                        onDragStart={() => setDragId(match.id)}
                                                        onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                                                        className="cursor-grab text-[#6d7fa3] hover:text-[#16243f]" title="드래그로 순서 변경">
                                                        <GripVertical size={16} />
                                                    </span>
                                                ) : (
                                                    <span className="text-[#6d7fa3]" title="종료된 경기 — 순서 고정"><Lock size={14} /></span>
                                                )}
                                                <span className="text-xs text-[#d8302c] uppercase tracking-[0.14em] whitespace-nowrap">GAME {match.match_order}</span>
                                                {match.winner && (
                                                    <span className="text-xs text-[#16243f] flex items-center gap-1 min-w-0">
                                                        <Trophy size={12} className="text-[#ee7c1b] shrink-0" />
                                                        <span className="truncate">{match.winner === 'A_WIN' ? match.team_a_name : match.team_b_name}</span>
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-xs px-2 py-1 tracking-wider" style={{ color: match.status === 'LIVE' ? '#0c1a0e' : '#fff', background: statusColor(match.status) }}>
                                                    {match.status}
                                                </span>
                                                {/* 라운드(조) 이동 */}
                                                <select value={match.round} disabled={locked}
                                                    onChange={e => handleMoveRound(match, e.target.value)}
                                                    title="다른 라운드로 이동"
                                                    className="text-xs bg-[#e9e1ca] text-[#16243f] border-2 border-[#33456a] px-1 py-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                                                    {ROUNDS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                                                </select>
                                                {/* 순서 ↑/↓ (인접 PENDING과 교환) */}
                                                <button onClick={() => nudgeMatch(match, -1)} disabled={!draggable} title="위로"
                                                    className="text-[#16243f] border-2 border-[#33456a] p-1 hover:border-[#ee7c1b] transition disabled:opacity-30 disabled:cursor-not-allowed">
                                                    <ChevronUp size={14} />
                                                </button>
                                                <button onClick={() => nudgeMatch(match, 1)} disabled={!draggable} title="아래로"
                                                    className="text-[#16243f] border-2 border-[#33456a] p-1 hover:border-[#ee7c1b] transition disabled:opacity-30 disabled:cursor-not-allowed">
                                                    <ChevronDown size={14} />
                                                </button>
                                                {/* ENDED 잠금 토글 (2단계 확인) */}
                                                {match.status === 'ENDED' && (
                                                    <button onClick={() => toggleUnlock(match)}
                                                        title={locked ? '잠금 해제 (종료 경기 수정)' : '다시 잠금'}
                                                        className={`p-1 border-2 transition ${locked ? 'text-[#16243f] border-[#33456a]' : 'text-white bg-[#d8302c] border-[#d8302c]'}`}>
                                                        {locked ? <Lock size={14} /> : <Unlock size={14} />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* 팀/스코어 입력 — ENDED 잠금 시 비활성 */}
                                        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                                            <div className="space-y-2">
                                                <input disabled={locked} className="w-full bg-[#16243f] border-2 border-[#33456a] px-3 py-2 text-[#e9e1ca] text-center placeholder-[#6d7fa3] focus:outline-none focus:border-[#ee7c1b] transition disabled:opacity-60"
                                                    placeholder="팀 A" value={match.team_a_name} onChange={e => updateMatch(match.id, 'team_a_name', e.target.value)} />
                                                <input disabled={locked} type="number" className="w-full bg-[#16243f] border-2 border-[#33456a] px-3 py-3 text-[#e9e1ca] text-center text-2xl placeholder-[#6d7fa3] focus:outline-none focus:border-[#ee7c1b] transition disabled:opacity-60"
                                                    value={match.team_a_score} onChange={e => updateMatch(match.id, 'team_a_score', parseInt(e.target.value) || 0)} />
                                            </div>
                                            <div className="text-[#16243f] text-lg">VS</div>
                                            <div className="space-y-2">
                                                <input disabled={locked} className="w-full bg-[#16243f] border-2 border-[#33456a] px-3 py-2 text-[#e9e1ca] text-center placeholder-[#6d7fa3] focus:outline-none focus:border-[#ee7c1b] transition disabled:opacity-60"
                                                    placeholder="팀 B" value={match.team_b_name} onChange={e => updateMatch(match.id, 'team_b_name', e.target.value)} />
                                                <input disabled={locked} type="number" className="w-full bg-[#16243f] border-2 border-[#33456a] px-3 py-3 text-[#e9e1ca] text-center text-2xl placeholder-[#6d7fa3] focus:outline-none focus:border-[#ee7c1b] transition disabled:opacity-60"
                                                    value={match.team_b_score} onChange={e => updateMatch(match.id, 'team_b_score', parseInt(e.target.value) || 0)} />
                                            </div>
                                        </div>

                                        {/* 몰수패 팀 선택 패널 */}
                                        {forfeitTarget === match.id && (
                                            <div className="flex flex-wrap items-center gap-2 bg-[#d8302c]/10 border-2 border-[#d8302c]/40 p-2">
                                                <span className="text-xs text-[#16243f] tracking-wider">몰수패(불참) 팀 선택 — 상대팀 20:0 승:</span>
                                                <button onClick={() => applyForfeit(match, 'A')}
                                                    className="text-xs text-white bg-[#d8302c] hover:brightness-110 px-3 py-1.5 tracking-wider transition">
                                                    {match.team_a_name || '팀 A'} 몰수패
                                                </button>
                                                <button onClick={() => applyForfeit(match, 'B')}
                                                    className="text-xs text-white bg-[#d8302c] hover:brightness-110 px-3 py-1.5 tracking-wider transition">
                                                    {match.team_b_name || '팀 B'} 몰수패
                                                </button>
                                                <button onClick={() => setForfeitTarget(null)}
                                                    className="text-xs text-[#16243f] border-2 border-[#33456a] px-3 py-1 tracking-wider hover:border-[#ee7c1b] transition">
                                                    취소
                                                </button>
                                            </div>
                                        )}

                                        {/* 액션 버튼 */}
                                        <div className="flex gap-2 justify-between">
                                            <div className="flex gap-2">
                                                <button onClick={() => handleDeleteMatch(match)} disabled={deleting === match.id}
                                                    className="text-[#d8302c] hover:brightness-110 text-sm flex items-center gap-1 px-4 py-2 bg-[#d8302c]/12 border-2 border-[#d8302c]/40 transition disabled:opacity-50 tracking-wider">
                                                    <Trash2 size={14} /> {deleting === match.id ? '삭제중...' : '삭제'}
                                                </button>
                                                {/* 몰수패 — 두 팀이 정해진 미종료 경기만 */}
                                                {match.team_a_name && match.team_b_name && match.status !== 'ENDED' && forfeitTarget !== match.id && (
                                                    <button onClick={() => setForfeitTarget(match.id)}
                                                        className="text-[#16243f] text-sm flex items-center gap-1 px-4 py-2 border-2 border-[#33456a] hover:border-[#d8302c] transition tracking-wider">
                                                        <Flag size={14} /> 몰수
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                {/* 라이브 기록 버튼 */}
                                                {match.team_a_name && match.team_b_name && match.status !== 'ENDED' && (
                                                    <button onClick={() => startLiveRecord(match)}
                                                        className="bg-[#34c13e] hover:brightness-110 text-white text-sm px-4 py-2 flex items-center gap-2 tracking-wider transition">
                                                        <Play size={14} /> 기록 시작
                                                    </button>
                                                )}
                                                <button onClick={() => handleSaveMatch(match)} disabled={saving === match.id || locked}
                                                    className="bg-[#ee7c1b] hover:brightness-110 disabled:opacity-50 text-white text-sm px-4 py-2 flex items-center gap-2 tracking-wider transition">
                                                    <Save size={14} /> {saving === match.id ? '저장중...' : '저장'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    );
                                })
                            )}
                        </div>
                    </section>
                )}

                {/* 토너먼트 브래킷 시각화 */}
                {activeTournamentId && bracketRounds.length > 0 && (
                    <section className="bg-[#1d2e4d] border-2 border-[#33456a] p-6 space-y-4">
                        <h2 className="text-base text-[#e9e1ca] uppercase tracking-[0.18em]">
                            <Trophy size={14} className="inline mr-2 text-[#ee7c1b]" />
                            토너먼트 대진표
                        </h2>
                        <div className="overflow-x-auto">
                            <div className="flex gap-6 min-w-max py-4">
                                {bracketRounds.map(round => {
                                    const roundMatches = allMatches.filter(m => m.round === round.id).sort((a, b) => a.match_order - b.match_order);
                                    return (
                                        <div key={round.id} className="flex flex-col gap-3 min-w-[200px]">
                                            <h3 className="text-xs text-[#ee7c1b] uppercase tracking-[0.2em] text-center pb-2 border-b-2 border-[#33456a]">{round.label}</h3>
                                            {roundMatches.map(match => (
                                                <div key={match.id} className="overflow-hidden text-sm">
                                                    <div className={`flex items-center justify-between px-3 py-2 ${match.winner === 'A_WIN' ? 'bg-[#e9e1ca] text-[#16243f]' : 'bg-[#16243f] text-[#8ea0c2]'}`}>
                                                        <span className="truncate max-w-[120px]">{match.team_a_name || '—'}</span>
                                                        <span className="text-lg">{match.team_a_score}</span>
                                                    </div>
                                                    <div className={`flex items-center justify-between px-3 py-2 ${match.winner === 'B_WIN' ? 'bg-[#e9e1ca] text-[#16243f]' : 'bg-[#16243f] text-[#8ea0c2]'}`}>
                                                        <span className="truncate max-w-[120px]">{match.team_b_name || '—'}</span>
                                                        <span className="text-lg">{match.team_b_score}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>
                )}

                {/* 추가경기 만들기 — 조별 동률 타이브레이크 등. 3분 단판, round:'EXTRA'로 순위 집계 제외 */}
                {showExtraGameForm && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
                        onClick={closeExtraGameForm}>
                        <div className="bg-[#1d2e4d] border-2 border-[#33456a] p-6 space-y-4 max-w-sm w-full"
                            onClick={e => e.stopPropagation()}>
                            <h2 className="text-base text-[#e9e1ca] uppercase tracking-[0.18em]">추가경기 만들기</h2>
                            {extraGameAutoNote ? (
                                <p className="text-xs text-[#ee7c1b] leading-relaxed bg-[#ee7c1b]/10 border border-[#ee7c1b]/40 p-3">
                                    ⚠️ {extraGameAutoNote}
                                </p>
                            ) : (
                                <p className="text-xs text-[#8ea0c2] leading-relaxed">
                                    조별 동률 타이브레이크 등 특수 경기용. 게임클락 3분 단판으로 시작되며,
                                    순위·와일드카드 집계에는 반영되지 않습니다.
                                </p>
                            )}
                            <div>
                                <label className="text-xs text-[#8ea0c2] block mb-1">조 선택</label>
                                <select
                                    className="w-full bg-[#16243f] border-2 border-[#33456a] px-4 py-3 text-[#e9e1ca] focus:outline-none focus:border-[#ee7c1b] transition"
                                    value={extraGameGroup}
                                    onChange={e => { setExtraGameGroup(e.target.value); setExtraTeamAName(''); setExtraTeamBName(''); }}
                                    autoFocus
                                >
                                    <option value="" className="bg-[#16243f]">조를 선택하세요</option>
                                    {groupRoundsAvailable.map(r => (
                                        <option key={r} value={r} className="bg-[#16243f]">{ROUNDS.find(x => x.id === r)?.label || r}</option>
                                    ))}
                                </select>
                            </div>
                            <select
                                className="w-full bg-[#16243f] border-2 border-[#33456a] px-4 py-3 text-[#e9e1ca] focus:outline-none focus:border-[#ee7c1b] transition disabled:opacity-40"
                                value={extraTeamAName}
                                onChange={e => setExtraTeamAName(e.target.value)}
                                disabled={!extraGameGroup}
                            >
                                <option value="" className="bg-[#16243f]">팀 A 선택</option>
                                {teamsInGroup(extraGameGroup).map(n => (
                                    <option key={n} value={n} className="bg-[#16243f]" disabled={n === extraTeamBName}>{n}</option>
                                ))}
                            </select>
                            <select
                                className="w-full bg-[#16243f] border-2 border-[#33456a] px-4 py-3 text-[#e9e1ca] focus:outline-none focus:border-[#ee7c1b] transition disabled:opacity-40"
                                value={extraTeamBName}
                                onChange={e => setExtraTeamBName(e.target.value)}
                                disabled={!extraGameGroup}
                            >
                                <option value="" className="bg-[#16243f]">팀 B 선택</option>
                                {teamsInGroup(extraGameGroup).map(n => (
                                    <option key={n} value={n} className="bg-[#16243f]" disabled={n === extraTeamAName}>{n}</option>
                                ))}
                            </select>
                            <div className="flex gap-3">
                                <button onClick={closeExtraGameForm}
                                    className="flex-1 bg-[#16243f] border-2 border-[#33456a] text-[#8ea0c2] hover:text-[#e9e1ca] px-4 py-3 tracking-wider transition">
                                    취소
                                </button>
                                <button onClick={createAndStartExtraGame}
                                    className="flex-1 bg-[#ee7c1b] hover:brightness-110 text-white px-4 py-3 flex items-center justify-center gap-2 tracking-wider transition">
                                    <Play size={16} /> 3분 경기 시작
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
