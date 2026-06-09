import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronUp, ArrowLeft, Plus, Save, Trash2, Trophy, ChevronDown, Power, Play, Pause, RotateCcw, X, Minus, BellRing, Palette, ChevronsUp, ChevronsDown, Keyboard, ChevronLeft, ChevronRight } from 'lucide-react';
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

const ROUNDS = [
    { id: 'GROUP_A', label: '예선 A' },
    { id: 'GROUP_B', label: '예선 B' },
    { id: 'QUARTER', label: '8강' },
    { id: 'SEMI', label: '4강' },
    { id: '3RD_PLACE', label: '3위전' },
    { id: 'FINAL', label: '결승' },
];

const statusColor = (s) => {
    if (s === 'ENDED') return '#d8302c'; // GRIT LAB red
    if (s === 'LIVE') return '#34c13e';  // GRIT LAB green
    return '#33456a';                    // navy-line
};

const formatTime = (totalSeconds) => {
    const t = Math.max(0, totalSeconds);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    if (t < 60 && t > 0) {
        // 1분 미만: SS.x 형식 (0.1초 단위 표시)
        const tenths = Math.floor((Math.round(t * 10) % 10));
        return `${s.toString().padStart(2, '0')}.${tenths}`;
    }
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
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
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

const _playBuf = (buf) => {
    if (!buf) return;
    try {
        const ctx = _ensureCtx();
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
    const navigate = useNavigate();
    const { id: urlTournamentId } = useParams();

    const [tournaments, setTournaments] = useState([]);
    const [activeTournamentId, setActiveTournamentId] = useState(null);
    const [newTitle, setNewTitle] = useState('');
    const [activeRound, setActiveRound] = useState('GROUP_A');
    const [matches, setMatches] = useState([]);
    const [allMatches, setAllMatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null);
    const [deleting, setDeleting] = useState(null);

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
    const [teamATimeouts, setTeamATimeouts] = useState(parseInt(localStorage.getItem('gritlab_default_timeouts')) || 1);
    const [teamBTimeouts, setTeamBTimeouts] = useState(parseInt(localStorage.getItem('gritlab_default_timeouts')) || 1);
    const shotClockLastTapRef = useRef(0);
    const [showEditTime, setShowEditTime] = useState(false);
    const [showKbdGuide, setShowKbdGuide] = useState(false); // 키보드 안내 오버레이 (대회당 1회)
    // ── 인터미션(경기 종료 후 다음 경기 안내 카운트다운) ──
    const [showIntermission, setShowIntermission] = useState(false);
    const [intermissionSec, setIntermissionSec] = useState(90);
    const [intermissionRunning, setIntermissionRunning] = useState(true);
    const [intermissionNext, setIntermissionNext] = useState(null);
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
        const { data } = await supabase
            .from('tournaments')
            .select('id, title, type, status, created_at')
            .order('created_at', { ascending: false });

        const allData = data || [];
        setTournaments(allData);

        if (urlTournamentId && allData.some(t => t.id === urlTournamentId)) {
            setActiveTournamentId(urlTournamentId);
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
        if (!activeTournamentId) { setMatches([]); setAllMatches([]); return; }
        fetchMatches();
    }, [activeTournamentId]);

    useEffect(() => {
        setMatches(allMatches.filter(m => m.round === activeRound));
    }, [activeRound, allMatches]);

    const fetchMatches = async () => {
        const { data } = await supabase
            .from('game_3v3_brackets')
            .select('*')
            .eq('tournament_id', activeTournamentId)
            .order('round')
            .order('match_order', { ascending: true });
        setAllMatches(data || []);
    };

    // ── 타이머 로직 (100ms 간격 → 1/10초 정밀도) ──
    useEffect(() => {
        if (timerRunning) {
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
    // 샷클락 리셋은 F/J(검지 홈버튼 돌기)에 배치 — 가장 빈번 + 블라인드 기준점
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
            switch (e.code) {
                case 'ArrowUp':    // 게임클락 +1초
                    e.preventDefault(); setTimerRunning(false);
                    setGameTime(t => Number((t + 1).toFixed(1))); return;
                case 'ArrowDown':  // 게임클락 -1초
                    e.preventDefault(); setTimerRunning(false);
                    setGameTime(t => Math.max(0, Number((t - 1).toFixed(1)))); return;
                case 'ArrowRight': // 샷클락 +1초
                    e.preventDefault(); setShotClockPaused(true);
                    setShotClock(s => Number((s + 1).toFixed(1))); return;
                case 'ArrowLeft':  // 샷클락 -1초
                    e.preventDefault(); setShotClockPaused(true);
                    setShotClock(s => Math.max(0, Number((s - 1).toFixed(1)))); return;
                default: break;
            }

            if (e.repeat) return;   // 이하 동작은 키 홀드 자동반복 차단 (점수 폭주 방지)

            switch (e.code) {
                // ── 왼손 = A팀 ──
                case 'KeyQ': setTeamAScore(s => s + 1); break;                  // +1점
                case 'KeyW': setTeamAScore(s => s + 2); break;                  // +2점
                case 'KeyA': setTeamAScore(s => Math.max(0, s - 1)); break;     // 정정 -1
                case 'KeyS': setTeamAFouls(f => f + 1); break;                  // 파울 +1
                case 'KeyZ': setTeamATimeouts(prev => prev === 0 ? 1 : prev - 1); break; // 타임아웃

                // ── 오른손 = B팀 ──
                case 'KeyP': setTeamBScore(s => s + 1); break;
                case 'KeyO': setTeamBScore(s => s + 2); break;
                case 'KeyL': setTeamBScore(s => Math.max(0, s - 1)); break;
                case 'KeyK': setTeamBFouls(f => f + 1); break;
                case 'KeyM': setTeamBTimeouts(prev => prev === 0 ? 1 : prev - 1); break;

                // ── 공통 / 중앙 ──
                case 'Space':       // 게임클락 시작/정지 (엄지)
                    e.preventDefault();
                    setTimerRunning(r => !r);
                    break;
                case 'KeyF':        // 샷클락 12초 리셋 + 재개 (왼손 검지 홈버튼)
                case 'KeyJ':        // 샷클락 12초 리셋 + 재개 (오른손 검지 홈버튼)
                    setShotClock(12);
                    setShotClockPaused(false);
                    break;
                case 'KeyR':        // 게임클락 10:00 리셋
                    setTimerRunning(false);
                    setGameTime(600);
                    break;
                case 'KeyB':        // 수동 부저
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
        const nextOrder = roundMatches.length + 1;
        const { data, error } = await supabase
            .from('game_3v3_brackets')
            .insert([{
                tournament_id: activeTournamentId, round: activeRound, match_order: nextOrder,
                team_a_name: '', team_b_name: '', team_a_score: 0, team_b_score: 0, status: 'PENDING',
            }]).select().single();
        if (error) { alert('경기 추가 실패: ' + error.message); return; }
        if (data) setAllMatches(prev => [...prev, data]);
    };

    const handleSaveMatch = async (match) => {
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
        if (error) { alert('저장 실패: ' + error.message); }
        else { setAllMatches(prev => prev.map(m => m.id === match.id ? { ...m, winner, status: winner ? 'ENDED' : m.status } : m)); }
        setSaving(null);
    };

    const handleDeleteMatch = async (id) => {
        if (!confirm('이 경기를 삭제하시겠습니까?')) return;
        setDeleting(id);
        const { error } = await supabase.from('game_3v3_brackets').delete().eq('id', id);
        if (error) { alert('삭제 실패: ' + error.message); }
        else { setAllMatches(prev => prev.filter(m => m.id !== id)); }
        setDeleting(null);
    };

    const updateMatch = (id, field, value) => {
        setAllMatches(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
    };

    // ── 라이브 기록 시작 ──
    const startLiveRecord = (match) => {
        setLiveMatch(match);
        setTeamAScore(match.team_a_score || 0);
        setTeamBScore(match.team_b_score || 0);
        setTeamAFouls(0);
        setTeamBFouls(0);
        setGameTime(600);
        setShotClock(12);
        setTimerRunning(false);
    };

    // ── 대회 페이지(tournament.html)에서 경기 클릭 → 자동 기록시작 ──
    // tournament.html이 sessionStorage에 match id를 넣고 이 페이지로 이동시킨다.
    useEffect(() => {
        const mid = sessionStorage.getItem('gritlab_autostart_match');
        if (!mid || liveMatch || !allMatches.length) return;
        const m = allMatches.find(x => String(x.id) === String(mid));
        sessionStorage.removeItem('gritlab_autostart_match'); // 1회성 소비
        if (m) startLiveRecord(m);
    }, [allMatches]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── 다음 경기 찾기: 순서상 다음 PENDING(팀명 있는) 경기, 현재 제외 ──
    const findNextMatch = (currentId) => {
        return allMatches.find(m =>
            m.id !== currentId && m.status !== 'ENDED' && m.team_a_name && m.team_b_name
        ) || null;
    };

    // ── 라이브 기록 저장 → 인터미션(다음 경기 안내) ──
    const saveLiveAndClose = async () => {
        if (!liveMatch) return;
        // 1) 기존 저장 로직 그대로
        const updated = { ...liveMatch, team_a_score: teamAScore, team_b_score: teamBScore };
        updateMatch(liveMatch.id, 'team_a_score', teamAScore);
        updateMatch(liveMatch.id, 'team_b_score', teamBScore);
        await handleSaveMatch(updated);
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

    // 인터미션 제어
    const startNextNow = () => {
        setShowIntermission(false);
        if (intermissionNext) startLiveRecord(intermissionNext);
    };

    // 라이브 점수가 저장본과 다른지 (미저장 상태)
    const liveDirty = () => liveMatch && (teamAScore !== (liveMatch.team_a_score || 0) || teamBScore !== (liveMatch.team_b_score || 0));

    const closeLiveWithoutSave = () => {
        if (liveDirty() && !window.confirm('현재 경기 점수가 저장되지 않았습니다. 저장하지 않고 목록으로 나갈까요?')) return;
        setTimerRunning(false);
        setLiveMatch(null);
    };

    // 경기 간 순차 이동 (이전/다음). 미저장 라이브 점수가 있으면 확인 후 이동.
    const navigateToMatch = (target) => {
        if (!target || !liveMatch) return;
        if (liveDirty() && !window.confirm('현재 경기 점수가 저장되지 않았습니다. 저장하지 않고 이동할까요?')) return;
        setTimerRunning(false);
        startLiveRecord(target);
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
    const shotClockLow = shotClock > 0 && shotClock < 5;

    if (loading) {
        return <div className="min-h-screen bg-[#16243f] flex items-center justify-center text-[#8ea0c2]" style={{ fontFamily: "'Anton', 'Pretendard', sans-serif" }}>Loading...</div>;
    }

    // ═══════════════════════════════════
    //  인터미션 (경기 종료 후 다음 경기 안내 카운트다운) — GRIT LAB 3X3 톤
    // ═══════════════════════════════════
    if (showIntermission) {
        const mm = String(Math.floor(intermissionSec / 60)).padStart(2, '0');
        const ss = String(intermissionSec % 60).padStart(2, '0');
        const nx = intermissionNext;
        const nxRound = nx ? (ROUNDS.find(r => r.id === nx.round)?.label || nx.round) : null;
        const C = { navy: '#16243f', navy2: '#1d2e4d', line: '#33456a', cream: '#e9e1ca', orange: '#ee7c1b', green: '#34c13e', muted: '#7e90b3' };
        const anton = "'Anton', 'Pretendard', sans-serif";
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 32,
                background: 'radial-gradient(120% 120% at 50% -10%, #1d2e4d 0%, #16243f 60%)', color: C.cream, fontFamily: anton }}>
                <div style={{ fontSize: 16, letterSpacing: '.3em', color: C.muted }}>{nx ? '다음 경기까지' : 'INTERMISSION'}</div>

                {/* 카운트다운 */}
                <div style={{ fontSize: 'clamp(90px, 20vw, 220px)', lineHeight: .9, color: intermissionSec <= 10 ? C.orange : C.cream, fontVariantNumeric: 'tabular-nums' }}>
                    {mm}:{ss}
                </div>

                {/* 다음 경기 정보 */}
                {nx ? (
                    <div style={{ textAlign: 'center', border: `2px solid ${C.line}`, background: C.navy2, padding: '22px 40px', minWidth: 'min(760px, 92vw)' }}>
                        <div style={{ fontSize: 14, letterSpacing: '.2em', color: C.orange, marginBottom: 14 }}>
                            NEXT · {nxRound} · GAME {nx.match_order}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
                            <div style={{ flex: 1, fontSize: 'clamp(28px, 5vw, 56px)', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nx.team_a_name || '팀 A'}</div>
                            <div style={{ fontSize: 22, color: C.muted }}>VS</div>
                            <div style={{ flex: 1, fontSize: 'clamp(28px, 5vw, 56px)', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nx.team_b_name || '팀 B'}</div>
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', border: `2px solid ${C.orange}`, padding: '24px 48px' }}>
                        <div style={{ fontSize: 44 }}>🏆 모든 경기 종료</div>
                        <div style={{ fontSize: 14, letterSpacing: '.16em', color: C.muted, marginTop: 8 }}>대진표의 모든 경기가 끝났습니다</div>
                    </div>
                )}

                {/* 진행자 제어 — 90초 경과(카운트다운 0) 후에만 '다음 경기 시작' 활성화. 자동 전환 없음 */}
                {(() => {
                    const waiting = !!nx && intermissionSec > 0;   // 카운트다운 진행 중 = 시작 버튼 비활성
                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 6 }}>
                            <div style={{ display: 'flex', gap: 14 }}>
                                {waiting && (
                                    <button onClick={() => setIntermissionRunning(r => !r)}
                                        style={{ fontFamily: anton, fontSize: 16, letterSpacing: '.06em', padding: '13px 28px', border: `2px solid ${C.line}`, background: 'transparent', color: C.cream, cursor: 'pointer' }}>
                                        {intermissionRunning ? '❚❚ 일시정지' : '► 재개'}
                                    </button>
                                )}
                                <button onClick={startNextNow} disabled={waiting}
                                    style={{ fontFamily: anton, fontSize: 16, letterSpacing: '.06em', padding: '13px 30px', border: 'none',
                                        background: waiting ? C.line : (nx ? C.green : C.orange),
                                        color: waiting ? C.muted : '#0c1a0e',
                                        cursor: waiting ? 'not-allowed' : 'pointer', opacity: waiting ? .7 : 1 }}>
                                    {!nx ? '관리 화면으로' : waiting ? '다음 경기 시작 (대기 중)' : '▶ 다음 경기 시작'}
                                </button>
                            </div>
                            {waiting && (
                                <div style={{ fontSize: 13, letterSpacing: '.12em', color: C.muted }}>
                                    대기 시간이 끝나면 시작 버튼이 활성화됩니다
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>
        );
    }

    // ═══════════════════════════════════
    //  라이브 스코어보드 (기존 전광판 디자인 재사용)
    // ═══════════════════════════════════
    if (liveMatch) {
        const roundLabel = ROUNDS.find(r => r.id === liveMatch.round)?.label || liveMatch.round;
        const timeIsLow  = gameTime > 0 && gameTime <= 30;
        const timeIsZero = gameTime <= 0;
        const gameEnded  = timerRunning ? false : timeIsZero && gameTime === 0 && teamAScore !== teamBScore; // 간단한 보호 장치
        const aWins      = teamAScore > teamBScore;
        const bWins      = teamBScore > teamAScore;
        const shotClockZero = shotClock <= 0;

        // 경기 간 순차 이동 대상 (팀명 있는 경기, round→match_order 순). 버튼/마우스 전용 — 키보드 매핑 없음.
        const navList = allMatches.filter(m => m.team_a_name && m.team_b_name);
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
                        <button className={styles.iconBtn} onClick={closeLiveWithoutSave} title="경기 목록으로">
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
                        <span style={{ fontSize: 84, fontWeight: 900, color: '#111', fontFamily: 'Anton, sans-serif', letterSpacing: '0.08em', lineHeight: 1 }}>GRIT LAB 🏀</span>
                    </div>

                    <div className={styles.headerRight}>
                        <button className={styles.iconBtn} onClick={() => setShowKbdGuide(true)} title="키보드 조작 안내">
                            <Keyboard size={20} />
                        </button>
                        <button className={styles.iconBtn} onClick={playBuzzer} title="수동 부저">
                            <BellRing size={20} />
                        </button>
                        <button className={`${styles.iconBtn} ${styles.saveBtn}`} onClick={saveLiveAndClose} title="저장 & 종료">
                            <Save size={20} />
                        </button>
                    </div>
                </header>

                {/* 메인 스코어보드 */}
                <main className={styles.main}>
                    {/* 팀 A */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div className={`${styles.teamBlock} ${aWins && gameEnded ? styles.winner : ''}`} style={{ '--team-color': 'oklch(60% 0.20 255)' }}>
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
                         onClick={(e) => { e.stopPropagation(); setTeamATimeouts(prev => prev === 0 ? 1 : prev - 1); }}>
                        <span className={styles.foulLabel} style={{ marginTop: 0, marginBottom: 0 }}>Timeout</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {[0].map(i => (
                                <div key={i} className={`${styles.timeoutBall} ${i >= teamATimeouts ? styles.timeoutBallUsed : ''}`}>🏀</div>
                            ))}
                        </div>
                    </div>
                    </div>

                    {/* 중앙: 타이머 & 샷클락 */}
                    <div className={styles.centerBlock}>
                        <div className={styles.timerGroup}>
                            <p className={styles.timerLabel}>GAME CLOCK (TAP: Play/Pause, HOLD: Edit)</p>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                {gameTime < 60 ? (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 73, height: 34, cursor: 'pointer', transition: 'all 0.2s' }}
                                            onClick={(e) => { e.stopPropagation(); setTimerRunning(false); setGameTime(t => Number((t + 1).toFixed(1))); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); }}>
                                            <ChevronsUp size={28} />
                                        </button>
                                        <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 73, height: 34, cursor: 'pointer', transition: 'all 0.2s' }}
                                            onClick={(e) => { e.stopPropagation(); setTimerRunning(false); setGameTime(t => Number((t + 0.1).toFixed(1))); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); }}>
                                            <ChevronUp size={28} />
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 73, height: 34, cursor: 'pointer', transition: 'all 0.2s' }}
                                            onClick={(e) => { e.stopPropagation(); setTimerRunning(false); setGameTime(t => t + 60); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); }}>
                                            <ChevronsUp size={28} />
                                        </button>
                                        <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 73, height: 34, cursor: 'pointer', transition: 'all 0.2s' }}
                                            onClick={(e) => { e.stopPropagation(); setTimerRunning(false); setGameTime(t => t + 1); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); }}>
                                            <ChevronUp size={28} />
                                        </button>
                                    </div>
                                )}
                                <div
                                    className={`${styles.timerGiant} ${timeIsLow && !timeIsZero ? styles.timerDanger : ''} ${timeIsZero ? styles.timerZero : ''}`}
                                    {...gameClockHandlers}
                                    style={{ cursor: 'pointer', margin: 0, lineHeight: 1 }}
                                >
                                    {formatTime(gameTime)}
                                </div>
                                {gameTime < 60 ? (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 73, height: 34, cursor: 'pointer', transition: 'all 0.2s' }}
                                            onClick={(e) => { e.stopPropagation(); setTimerRunning(false); setGameTime(t => Math.max(0, Number((t - 1).toFixed(1)))); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); }}>
                                            <ChevronsDown size={28} />
                                        </button>
                                        <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 73, height: 34, cursor: 'pointer', transition: 'all 0.2s' }}
                                            onClick={(e) => { e.stopPropagation(); setTimerRunning(false); setGameTime(t => Math.max(0, Number((t - 0.1).toFixed(1)))); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); }}>
                                            <ChevronDown size={28} />
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 73, height: 34, cursor: 'pointer', transition: 'all 0.2s' }}
                                            onClick={(e) => { e.stopPropagation(); setTimerRunning(false); setGameTime(t => Math.max(0, t - 60)); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); }}>
                                            <ChevronsDown size={28} />
                                        </button>
                                        <button className={styles.iconBtn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: 'none', color: 'rgba(255,255,255,0.6)', width: 73, height: 34, cursor: 'pointer', transition: 'all 0.2s' }}
                                            onClick={(e) => { e.stopPropagation(); setTimerRunning(false); setGameTime(t => Math.max(0, t - 1)); }}
                                            onTouchEnd={(e) => { e.stopPropagation(); }}>
                                            <ChevronDown size={28} />
                                        </button>
                                    </div>
                                )}
                                <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                                    onClick={(e) => { e.stopPropagation(); setTimerRunning(false); setGameTime(600); }}>
                                    <RotateCcw size={14} /> 10:00
                                </button>
                            </div>
                        </div>

                        <div className={styles.shotClockGroup}>
                            <p className={styles.timerLabel}>SHOT CLOCK</p>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div className={`${styles.teamBlock} ${bWins && gameEnded ? styles.winner : ''}`} style={{ '--team-color': 'oklch(65% 0.21 38)' }}>
                        <div className={styles.teamHeaderRow}>
                            <div className={styles.teamNameWrap}>
                                <div className={styles.teamNameRow}>
                                    <h2 className={styles.teamNameHuge} style={{ '--name-len': Math.max(4, (liveMatch.team_b_name || '팀 B').length) }}>
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
                         onClick={(e) => { e.stopPropagation(); setTeamBTimeouts(prev => prev === 0 ? 1 : prev - 1); }}>
                        <span className={styles.foulLabel} style={{ marginTop: 0, marginBottom: 0 }}>Timeout</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {[0].map(i => (
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
                    <button onClick={() => navigate('/tournament/dashboard')} className="text-[#8ea0c2] hover:text-[#e9e1ca] transition">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-xl tracking-[0.06em]">
                        <span className="text-[#ee7c1b]">GRIT LAB</span> 3:3 ADMIN
                    </h1>
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
                                onChange={e => setActiveTournamentId(e.target.value)}
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
                            <button onClick={handleAddMatch}
                                className="bg-[#16243f] hover:border-[#ee7c1b] border-2 border-[#33456a] text-[#e9e1ca] text-sm px-4 py-2 flex items-center gap-2 tracking-wider transition">
                                <Plus size={14} /> 경기 추가
                            </button>
                        </div>

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
                                matches.map((match) => (
                                    <div key={match.id} className="bg-[#e9e1ca] border-2 border-[#33456a] p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-[#d8302c] uppercase tracking-[0.14em]">GAME {match.match_order}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs px-2 py-1 tracking-wider" style={{ color: match.status === 'LIVE' ? '#0c1a0e' : '#fff', background: statusColor(match.status) }}>
                                                    {match.status}
                                                </span>
                                                {match.winner && (
                                                    <span className="text-xs text-[#16243f] flex items-center gap-1">
                                                        <Trophy size={12} className="text-[#ee7c1b]" />
                                                        {match.winner === 'A_WIN' ? match.team_a_name : match.team_b_name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* 팀/스코어 입력 */}
                                        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                                            <div className="space-y-2">
                                                <input className="w-full bg-[#16243f] border-2 border-[#33456a] px-3 py-2 text-[#e9e1ca] text-center placeholder-[#6d7fa3] focus:outline-none focus:border-[#ee7c1b] transition"
                                                    placeholder="팀 A" value={match.team_a_name} onChange={e => updateMatch(match.id, 'team_a_name', e.target.value)} />
                                                <input type="number" className="w-full bg-[#16243f] border-2 border-[#33456a] px-3 py-3 text-[#e9e1ca] text-center text-2xl placeholder-[#6d7fa3] focus:outline-none focus:border-[#ee7c1b] transition"
                                                    value={match.team_a_score} onChange={e => updateMatch(match.id, 'team_a_score', parseInt(e.target.value) || 0)} />
                                            </div>
                                            <div className="text-[#16243f] text-lg">VS</div>
                                            <div className="space-y-2">
                                                <input className="w-full bg-[#16243f] border-2 border-[#33456a] px-3 py-2 text-[#e9e1ca] text-center placeholder-[#6d7fa3] focus:outline-none focus:border-[#ee7c1b] transition"
                                                    placeholder="팀 B" value={match.team_b_name} onChange={e => updateMatch(match.id, 'team_b_name', e.target.value)} />
                                                <input type="number" className="w-full bg-[#16243f] border-2 border-[#33456a] px-3 py-3 text-[#e9e1ca] text-center text-2xl placeholder-[#6d7fa3] focus:outline-none focus:border-[#ee7c1b] transition"
                                                    value={match.team_b_score} onChange={e => updateMatch(match.id, 'team_b_score', parseInt(e.target.value) || 0)} />
                                            </div>
                                        </div>

                                        {/* 액션 버튼 */}
                                        <div className="flex gap-2 justify-between">
                                            <button onClick={() => handleDeleteMatch(match.id)} disabled={deleting === match.id}
                                                className="text-[#d8302c] hover:brightness-110 text-sm flex items-center gap-1 px-4 py-2 bg-[#d8302c]/12 border-2 border-[#d8302c]/40 transition disabled:opacity-50 tracking-wider">
                                                <Trash2 size={14} /> {deleting === match.id ? '삭제중...' : '삭제'}
                                            </button>
                                            <div className="flex gap-2">
                                                {/* 라이브 기록 버튼 */}
                                                {match.team_a_name && match.team_b_name && match.status !== 'ENDED' && (
                                                    <button onClick={() => startLiveRecord(match)}
                                                        className="bg-[#34c13e] hover:brightness-110 text-white text-sm px-4 py-2 flex items-center gap-2 tracking-wider transition">
                                                        <Play size={14} /> 기록 시작
                                                    </button>
                                                )}
                                                <button onClick={() => handleSaveMatch(match)} disabled={saving === match.id}
                                                    className="bg-[#ee7c1b] hover:brightness-110 disabled:opacity-50 text-white text-sm px-4 py-2 flex items-center gap-2 tracking-wider transition">
                                                    <Save size={14} /> {saving === match.id ? '저장중...' : '저장'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
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
            </div>
        </div>
    );
}
