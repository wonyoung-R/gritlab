import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Trash2, Trophy, ChevronDown, Power, Play, Pause, RotateCcw, X, Minus, BellRing, Palette } from 'lucide-react';
import styles from './scoreboard.module.css';

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
    if (s === 'ENDED') return '#ef4444';
    if (s === 'LIVE') return '#22c55e';
    return '#6b7280';
};

const formatTime = (totalSeconds) => {
    const t = Math.max(0, totalSeconds);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    if (t < 60 && t > 0) {
        const tenths = Math.floor((t % 1) * 10);
        return `${s.toString().padStart(2, '0')}.${tenths}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formatShotClock = (seconds) => {
    const t = Math.max(0, seconds);
    if (t < 5 && t > 0) {
        const whole = Math.floor(t);
        const tenths = Math.floor((t % 1) * 10);
        return `${whole}.${tenths}`;
    }
    return Math.floor(t).toString().padStart(2, '0');
};

// 농구 부저 사운드
const playBuzzer = () => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const freqs = [250, 265, 280, 295];
        const duration = 1.2;
        freqs.forEach(freq => {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        });
    } catch (e) { /* silent */ }
};

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
    const [timerRunning, setTimerRunning] = useState(false);
    const [teamAScore, setTeamAScore] = useState(0);
    const [teamBScore, setTeamBScore] = useState(0);
    const [teamAFouls, setTeamAFouls] = useState(0);
    const [teamBFouls, setTeamBFouls] = useState(0);
    const [showEditTime, setShowEditTime] = useState(false);
    const [tempTime, setTempTime] = useState(10);
    const timerRef = useRef(null);

    // ── 게임클락 롱프레스: 시간 설정, 탭: 재생/일시정지 ──
    const gameClockHandlers = useLongPress(() => {
        setTimerRunning(false);
        setTempTime(Math.ceil(gameTime / 60));
        setShowEditTime(true);
    }, () => {
        if (!timerRunning && shotClock <= 0) return;
        setTimerRunning(!timerRunning);
    }, 300);

    // ── 샷클락 탭: 12초 리셋, 롱프레스: 일시정지 토글 ──
    const shotClockHandlers = useLongPress(() => {
        // 샷클락 일시정지는 별도 state 없이 간단히 0으로 설정
    }, () => {
        setShotClock(12);
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
            timerRef.current = setInterval(() => {
                const tick = 0.1;
                setGameTime(prev => {
                    const next = Math.round((prev - tick) * 10) / 10;
                    if (next <= 0) {
                        setTimerRunning(false);
                        clearInterval(timerRef.current);
                        if (prev > 0) playBuzzer();
                        return 0;
                    }
                    return next;
                });
                setShotClock(prev => {
                    const next = Math.round((prev - tick) * 10) / 10;
                    if (next <= 0) {
                        if (prev > 0) playBuzzer();
                        return 0;
                    }
                    return next;
                });
            }, 100);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [timerRunning]);

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

    // ── 라이브 기록 저장 & 닫기 ──
    const saveLiveAndClose = async () => {
        if (!liveMatch) return;
        // 로컬 상태 → match 데이터에 반영
        const updated = { ...liveMatch, team_a_score: teamAScore, team_b_score: teamBScore };
        updateMatch(liveMatch.id, 'team_a_score', teamAScore);
        updateMatch(liveMatch.id, 'team_b_score', teamBScore);
        await handleSaveMatch(updated);
        setTimerRunning(false);
        setLiveMatch(null);
    };

    const closeLiveWithoutSave = () => {
        setTimerRunning(false);
        setLiveMatch(null);
    };

    const activeTournament = tournaments.find(t => t.id === activeTournamentId);
    const bracketRounds = ROUNDS.filter(r => allMatches.some(m => m.round === r.id));
    const shotClockLow = shotClock > 0 && shotClock < 5;

    if (loading) {
        return <div className="min-h-screen bg-[#07090e] flex items-center justify-center text-gray-500">Loading...</div>;
    }

    // ═══════════════════════════════════
    //  라이브 스코어보드 (기존 전광판 디자인 재사용)
    // ═══════════════════════════════════
    if (liveMatch) {
        const roundLabel = ROUNDS.find(r => r.id === liveMatch.round)?.label || liveMatch.round;
        const timeIsLow  = gameTime > 0 && gameTime <= 30;
        const timeIsZero = gameTime <= 0;
        const gameEnded  = timeIsZero;
        const aWins      = teamAScore > teamBScore;
        const bWins      = teamBScore > teamAScore;
        const shotClockZero = shotClock <= 0;

        return (
            <div className={`${styles.scoreboard} ${gameEnded ? styles.ended : timerRunning ? styles.live : ''}`}>
                {/* 배경 */}
                <div className={styles.bgCourt} />
                <div className={styles.bgGrain} />
                {timeIsLow && !timeIsZero && <div className={styles.dangerPulse} />}
                {gameEnded && <div className={styles.endedOverlayGlow} />}

                {/* 헤더 */}
                <header className={styles.header}>
                    <div className={styles.headerLeft}>
                        <button className={styles.iconBtn} onClick={closeLiveWithoutSave}>
                            <ArrowLeft size={20} />
                        </button>
                        <div className={styles.sessionLabel}>
                            <span className={styles.sessionLabelTag}>{roundLabel}</span>
                            <span className={styles.sessionLabelText}>GAME {liveMatch.match_order}</span>
                        </div>
                    </div>

                    <div className={styles.periodBadge}>
                        <span className={styles.periodText} style={{ color: '#ef4444', fontSize: '10px' }}>● REC</span>
                    </div>

                    <div className={styles.headerRight}>
                        <button className={styles.iconBtn} onClick={playBuzzer} title="수동 부저">
                            <BellRing size={18} />
                        </button>
                        <button className={`${styles.iconBtn} ${styles.saveBtn}`} onClick={saveLiveAndClose} title="저장 & 종료">
                            <Save size={18} />
                        </button>
                    </div>
                </header>

                {/* 메인 스코어보드 */}
                <main className={styles.main}>
                    {/* 팀 A */}
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
                            <div className={`${styles.foulDigit} ${teamAFouls >= 7 ? styles.foulPenalty : ''}`}
                                onClick={() => setTeamAFouls(f => f + 1)} style={{ cursor: 'pointer' }}>
                                {teamAFouls}
                            </div>
                            {teamAFouls >= 7 && <div className={styles.penaltyBadge}>PENALTY</div>}
                        </div>
                    </div>

                    {/* 중앙: 타이머 & 샷클락 */}
                    <div className={styles.centerBlock}>
                        <div className={styles.timerGroup}>
                            <p className={styles.timerLabel}>GAME CLOCK (TAP: Play/Pause, HOLD: Edit)</p>
                            <div
                                className={`${styles.timerGiant} ${timeIsLow && !timeIsZero ? styles.timerDanger : ''} ${timeIsZero ? styles.timerZero : ''}`}
                                {...gameClockHandlers}
                                style={{ cursor: 'pointer' }}
                            >
                                {formatTime(gameTime)}
                            </div>
                        </div>

                        <div className={styles.shotClockGroup}>
                            <p className={styles.timerLabel}>SHOT CLOCK (TAP: 12s)</p>
                            <div
                                className={`${styles.shotClockGiant} ${shotClockZero ? styles.timerDanger : ''} ${shotClockLow ? styles.shotClockDanger : ''}`}
                                {...shotClockHandlers}
                                style={{ cursor: 'pointer' }}
                            >
                                {formatShotClock(shotClock)}
                            </div>
                        </div>

                        {gameEnded && <div className={styles.endedLabel}>MATCH FINISHED</div>}
                    </div>

                    {/* 팀 B */}
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
                            <div className={`${styles.foulDigit} ${teamBFouls >= 7 ? styles.foulPenalty : ''}`}
                                onClick={() => setTeamBFouls(f => f + 1)} style={{ cursor: 'pointer' }}>
                                {teamBFouls}
                            </div>
                            {teamBFouls >= 7 && <div className={styles.penaltyBadge}>PENALTY</div>}
                        </div>
                    </div>
                </main>

                {/* 롱프레스 모달: 시간 설정 */}
                {showEditTime && (
                    <div className={styles.setupPanel} onClick={() => setShowEditTime(false)}>
                        <div className={styles.setupPanelInner} onClick={e => e.stopPropagation()}>
                            <h3 className={styles.setupPanelTitle}>타이머 시간 설정</h3>
                            <div className={styles.newSessionForm}>
                                <input
                                    type="number"
                                    className={styles.setupInput}
                                    value={tempTime}
                                    onChange={e => setTempTime(e.target.value)}
                                    autoFocus
                                />
                                <span style={{ color: 'white', alignSelf: 'center' }}>분</span>
                                <button className={styles.setupCreateBtn} onClick={() => {
                                    const newSec = parseInt(tempTime) * 60;
                                    setGameTime(Number.isNaN(newSec) ? 600 : newSec);
                                    setShotClock(12);
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
        <div className="min-h-screen bg-[#07090e] text-white font-sans">
            {/* Header */}
            <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between bg-[#07090e]/80 backdrop-blur sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/tournament/dashboard')} className="text-gray-400 hover:text-white transition">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-xl font-black italic tracking-tight">
                        <span className="text-orange-400">GRIT LAB</span> 3:3 ADMIN
                    </h1>
                </div>

                {activeTournament && (
                    <button
                        onClick={handleToggleStatus}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition ${
                            activeTournament.status === 'ACTIVE'
                                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30'
                        }`}
                    >
                        <Power size={16} />
                        {activeTournament.status === 'ACTIVE' ? '대회 종료' : '대회 재개'}
                    </button>
                )}
            </header>

            <div className="max-w-5xl mx-auto p-6 space-y-6">

                {/* 대회 선택 / 생성 */}
                <section className="bg-[#0d111c] border border-white/8 rounded-2xl p-6 space-y-4">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">대회 관리</h2>

                    <div className="flex gap-3">
                        <input
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition"
                            placeholder="새 3v3 대회명 (예: 2026.03 GritLab 3:3)"
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateTournament()}
                        />
                        <button onClick={handleCreateTournament}
                            className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-3 rounded-xl flex items-center gap-2 transition">
                            <Plus size={16} /> 생성
                        </button>
                    </div>

                    {tournaments.length > 0 && (
                        <div className="relative">
                            <select
                                className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white font-medium focus:outline-none focus:border-orange-500 transition cursor-pointer"
                                value={activeTournamentId || ''}
                                onChange={e => setActiveTournamentId(e.target.value)}
                            >
                                {tournaments.map(t => (
                                    <option key={t.id} value={t.id} className="bg-[#111]">
                                        {t.type === '3V3' ? '[3v3] ' : ''}{t.title} {t.status === 'ACTIVE' ? '(진행중)' : '(종료)'}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                        </div>
                    )}

                    {activeTournament && (
                        <div className="flex items-center gap-3 text-sm">
                            <div className={`w-2 h-2 rounded-full ${activeTournament.status === 'ACTIVE' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                            <span className="text-gray-400">
                                {activeTournament.title} — <strong className={activeTournament.status === 'ACTIVE' ? 'text-green-400' : 'text-red-400'}>
                                    {activeTournament.status === 'ACTIVE' ? '진행중' : '종료됨'}
                                </strong>
                            </span>
                        </div>
                    )}
                </section>

                {/* 라운드 탭 + 경기 관리 */}
                {activeTournamentId && (
                    <section className="bg-[#0d111c] border border-white/8 rounded-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">경기 관리</h2>
                            <button onClick={handleAddMatch}
                                className="bg-white/10 hover:bg-white/15 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition">
                                <Plus size={14} /> 경기 추가
                            </button>
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {ROUNDS.map(r => {
                                const count = allMatches.filter(m => m.round === r.id).length;
                                return (
                                    <button key={r.id} onClick={() => setActiveRound(r.id)}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition ${
                                            activeRound === r.id ? 'bg-orange-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                        }`}>
                                        {r.label} {count > 0 && <span className="ml-1 text-xs opacity-70">({count})</span>}
                                    </button>
                                );
                            })}
                        </div>

                        {/* 경기 카드 */}
                        <div className="space-y-3">
                            {matches.length === 0 ? (
                                <div className="text-center text-gray-500 py-12 border border-dashed border-white/10 rounded-xl">
                                    이 라운드에 등록된 경기가 없습니다.
                                </div>
                            ) : (
                                matches.map((match) => (
                                    <div key={match.id} className="bg-white/5 border border-white/8 rounded-xl p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-gray-500 uppercase">GAME {match.match_order}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold px-2 py-1 rounded" style={{ color: statusColor(match.status), background: `${statusColor(match.status)}20` }}>
                                                    {match.status}
                                                </span>
                                                {match.winner && (
                                                    <span className="text-xs font-bold text-yellow-400 flex items-center gap-1">
                                                        <Trophy size={12} />
                                                        {match.winner === 'A_WIN' ? match.team_a_name : match.team_b_name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* 팀/스코어 입력 */}
                                        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                                            <div className="space-y-2">
                                                <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-center font-bold placeholder-gray-600 focus:outline-none focus:border-orange-500 transition"
                                                    placeholder="팀 A" value={match.team_a_name} onChange={e => updateMatch(match.id, 'team_a_name', e.target.value)} />
                                                <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-white text-center text-2xl font-black placeholder-gray-600 focus:outline-none focus:border-orange-500 transition"
                                                    value={match.team_a_score} onChange={e => updateMatch(match.id, 'team_a_score', parseInt(e.target.value) || 0)} />
                                            </div>
                                            <div className="text-gray-500 font-black text-lg">VS</div>
                                            <div className="space-y-2">
                                                <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-center font-bold placeholder-gray-600 focus:outline-none focus:border-orange-500 transition"
                                                    placeholder="팀 B" value={match.team_b_name} onChange={e => updateMatch(match.id, 'team_b_name', e.target.value)} />
                                                <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-white text-center text-2xl font-black placeholder-gray-600 focus:outline-none focus:border-orange-500 transition"
                                                    value={match.team_b_score} onChange={e => updateMatch(match.id, 'team_b_score', parseInt(e.target.value) || 0)} />
                                            </div>
                                        </div>

                                        {/* 액션 버튼 */}
                                        <div className="flex gap-2 justify-between">
                                            <button onClick={() => handleDeleteMatch(match.id)} disabled={deleting === match.id}
                                                className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1 px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition disabled:opacity-50">
                                                <Trash2 size={14} /> {deleting === match.id ? '삭제중...' : '삭제'}
                                            </button>
                                            <div className="flex gap-2">
                                                {/* 라이브 기록 버튼 */}
                                                {match.team_a_name && match.team_b_name && match.status !== 'ENDED' && (
                                                    <button onClick={() => startLiveRecord(match)}
                                                        className="bg-green-500/20 hover:bg-green-500/30 text-green-400 text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 border border-green-500/30 transition">
                                                        <Play size={14} /> 기록 시작
                                                    </button>
                                                )}
                                                <button onClick={() => handleSaveMatch(match)} disabled={saving === match.id}
                                                    className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition">
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
                    <section className="bg-[#0d111c] border border-white/8 rounded-2xl p-6 space-y-4">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                            <Trophy size={14} className="inline mr-2 text-yellow-400" />
                            토너먼트 대진표
                        </h2>
                        <div className="overflow-x-auto">
                            <div className="flex gap-6 min-w-max py-4">
                                {bracketRounds.map(round => {
                                    const roundMatches = allMatches.filter(m => m.round === round.id).sort((a, b) => a.match_order - b.match_order);
                                    return (
                                        <div key={round.id} className="flex flex-col gap-3 min-w-[200px]">
                                            <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest text-center pb-2 border-b border-white/10">{round.label}</h3>
                                            {roundMatches.map(match => (
                                                <div key={match.id} className={`border rounded-lg overflow-hidden text-sm ${match.status === 'ENDED' ? 'border-white/15' : 'border-white/8'}`}>
                                                    <div className={`flex items-center justify-between px-3 py-2 ${match.winner === 'A_WIN' ? 'bg-orange-500/15 text-white' : 'bg-white/3 text-gray-400'}`}>
                                                        <span className="font-bold truncate max-w-[120px]">{match.team_a_name || '—'}</span>
                                                        <span className="font-black text-lg">{match.team_a_score}</span>
                                                    </div>
                                                    <div className={`flex items-center justify-between px-3 py-2 border-t border-white/5 ${match.winner === 'B_WIN' ? 'bg-orange-500/15 text-white' : 'bg-white/3 text-gray-400'}`}>
                                                        <span className="font-bold truncate max-w-[120px]">{match.team_b_name || '—'}</span>
                                                        <span className="font-black text-lg">{match.team_b_score}</span>
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
