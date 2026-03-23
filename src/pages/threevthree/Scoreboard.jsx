import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import styles from './scoreboard.module.css';
import { ArrowLeft, Settings, Wifi, WifiOff, Plus, Minus, Play, Pause, RotateCcw, Edit2, Check, X, Save } from 'lucide-react';

// ────────────────────────────────────────
// 커스텀 훅: 롱프레스(Long Press) 감지기
// ────────────────────────────────────────
const useLongPress = (onLongPress, onClick, ms = 600) => {
    const timerRef = useRef()
    const isLongPress = useRef(false)
    const touchStartXY = useRef(null)

    const start = useCallback((e) => {
        isLongPress.current = false
        if (e.targetTouches) {
            touchStartXY.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY }
        }
        timerRef.current = setTimeout(() => {
            isLongPress.current = true
            onLongPress?.(e)
        }, ms)
    }, [onLongPress, ms])

    const stop = useCallback((e) => {
        clearTimeout(timerRef.current)
        // 터치 이동 시 롱프레스 취소
        if (e.type === 'touchend' && isLongPress.current === false && touchStartXY.current) {
            const touch = e.changedTouches[0]
            const dx = Math.abs(touch.clientX - touchStartXY.current.x)
            const dy = Math.abs(touch.clientY - touchStartXY.current.y)
            if (dx > 10 || dy > 10) return
        }
        if (!isLongPress.current) onClick?.(e)
    }, [onClick])

    return {
        onMouseDown: start,     onMouseUp: stop,
        onTouchStart: start,    onTouchEnd: stop,
        onMouseLeave: () => clearTimeout(timerRef.current),
    }
}

// ────────────────────────────────────────
// 타이머 포맷 유틸
// ────────────────────────────────────────
const formatTime = (totalSeconds) => {
    const t = Math.max(0, totalSeconds);
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = (t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

const formatShotClock = (seconds) => {
    return Math.max(0, seconds).toString().padStart(2, '0');
};

const TODAY_TITLE = () => {
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} GritLab 3:3`;
};

// 기본 로컬 경기 상태
const makeDefaultGame = () => ({
    team_a_name: '팀 A',
    team_b_name: '팀 B',
    team_a_score: 0,
    team_b_score: 0,
    period: 1,
    game_time: 600,   // 10분
    shot_clock: 12,   // 12초
    status: 'READY',
});

export default function ThreeVThreeScoreboard() {
    const navigate = useNavigate();

    // ── 전광판 상태 ──
    const [game, setGame]           = useState(makeDefaultGame());
    const [session, setSession]     = useState(null);
    const [sessions, setSessions]   = useState([]);
    const [isAdmin, setIsAdmin]     = useState(false);
    const [dbReady, setDbReady]     = useState(false);  

    // ── UI 상태 ──
    const [showSetup, setShowSetup]     = useState(false);
    const [editingTeam, setEditingTeam] = useState(null);
    const [tempName, setTempName]       = useState('');
    const [newSessionTitle, setNewSessionTitle] = useState('');
    const [timerRunning, setTimerRunning] = useState(false);
    const [showEditTime, setShowEditTime] = useState(false);
    const [tempTime, setTempTime]       = useState(10); // 기본 10분

    const [showResults, setShowResults] = useState(false);
    const [resultsData, setResultsData] = useState([]);
    const [resultsCountdown, setResultsCountdown] = useState(60);

    const timerRef  = useRef(null);
    const resultsTimerRef = useRef(null);

    // ── 인증 체크 ──
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            setIsAdmin(!!s);
        });
    }, []);

    // ── 초기 로드: DB 테이블 존재 여부 확인 후 분기 ──
    useEffect(() => {
        const init = async () => {
            try {
                const { data: sessionData, error: sessionError } = await supabase
                    .from('game_3v3_sessions')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (sessionError) {
                    console.info('[3:3 전광판] DB 테이블 미설정 → 로컬 모드로 실행');
                    setDbReady(false);
                    return;
                }

                setDbReady(true);
                setSessions(sessionData || []);

                const activeSession = (sessionData || []).find(s => s.status === 'ACTIVE');
                const targetSession = activeSession || (sessionData || [])[0];

                if (targetSession) {
                    setSession(targetSession);
                } else {
                    const { data: newSession } = await supabase
                        .from('game_3v3_sessions')
                        .insert([{ title: TODAY_TITLE(), status: 'ACTIVE' }])
                        .select()
                        .single();

                    if (newSession) {
                        setSession(newSession);
                        setSessions([newSession]);
                    }
                }
            } catch (err) {
                console.warn('[3:3 전광판] DB 연결 실패, 로컬 모드:', err.message);
                setDbReady(false);
            }
        };
        init();
    }, []);

    // ── 대회 결과 대시보드 60초 카운트다운 ──
    useEffect(() => {
        if (showResults) {
            setResultsCountdown(60);
            resultsTimerRef.current = setInterval(() => {
                setResultsCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(resultsTimerRef.current);
                        setShowResults(false);
                        handleNewGame();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            clearInterval(resultsTimerRef.current);
        }
        return () => clearInterval(resultsTimerRef.current);
    }, [showResults]);

    const fetchResults = async (sid) => {
        if (!dbReady) return [];
        try {
            const { data, error } = await supabase
                .from('game_3v3_results')
                .select('*')
                .eq('session_id', sid)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error(err);
            return [];
        }
    };

    // ── 로컬 타이머 ──
    useEffect(() => {
        if (timerRunning) {
            timerRef.current = setInterval(() => {
                setGame(prev => {
                    const nextTime = prev.game_time - 1;
                    const nextShot = prev.shot_clock - 1;

                    if (nextTime <= 0) {
                        setTimerRunning(false);
                        clearInterval(timerRef.current);
                        return { ...prev, game_time: 0, shot_clock: 0, status: 'ENDED' };
                    }
                    if (nextShot <= 0) {
                        // 샷클락 바이레이션: 삐 소리 후 정지 혹은 0초로 유지. 
                        setTimerRunning(false);
                        clearInterval(timerRef.current);
                        return { ...prev, game_time: nextTime, shot_clock: 0, status: 'PAUSED' };
                    }
                    return { ...prev, game_time: nextTime, shot_clock: nextShot };
                });
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [timerRunning]);

    // ── 스코어 변경 ──
    const handleScoreChange = (team, delta) => {
        setGame(prev => {
            const key = team === 'A' ? 'team_a_score' : 'team_b_score';
            return { ...prev, [key]: Math.max(0, prev[key] + delta) };
        });
    };

    // ── 타이머 토글 ──
    const handleTimerToggle = () => {
        setGame(prev => {
            // 샷클락이 0일 땐 재개할 수 없음 (수동 리셋 필요)
            if (!timerRunning && prev.shot_clock <= 0) return prev;
            return { ...prev, status: !timerRunning ? 'LIVE' : 'PAUSED' }
        });
        setTimerRunning(!timerRunning);
    };

    // ── 롱프레스 이벤트 핸들러 ──
    // [게임클락] 롱프레스: 시간 직접 설정 창 열기, 탭: 재생/일시정지
    const gameClockHandlers = useLongPress(() => {
        setTimerRunning(false);
        setTempTime(Math.ceil(game.game_time / 60)); // 현재 분
        setShowEditTime(true);
    }, handleTimerToggle, 400);

    // [샷클락] 롱프레스: 12초 리셋, 탭: 재생/일시정지
    const shotClockHandlers = useLongPress(() => {
        setGame(prev => ({ ...prev, shot_clock: 12 }));
    }, handleTimerToggle, 400);

    // [팀 스코어] 롱프레스: -1점, 탭: +1점 (모바일/패드 터치 딜레이 해소)
    const scoreAHandlers = useLongPress(() => {
        handleScoreChange('A', -1);
    }, () => {
        handleScoreChange('A', 1);
    }, 400);

    const scoreBHandlers = useLongPress(() => {
        handleScoreChange('B', -1);
    }, () => {
        handleScoreChange('B', 1);
    }, 400);

    // ── 팀 이름 편집 ──
    const handleTeamNameEdit = (team) => {
        setEditingTeam(team);
        setTempName(team === 'A' ? game.team_a_name : game.team_b_name);
    };
    const handleTeamNameSave = () => {
        if (!editingTeam) return;
        setGame(prev => {
            const key = editingTeam === 'A' ? 'team_a_name' : 'team_b_name';
            return { ...prev, [key]: tempName };
        });
        setEditingTeam(null);
    };

    // ── 게임 종료 후 DB 저장 ──
    const handleSaveResult = async () => {
        if (!isAdmin || !dbReady || !session) {
            alert("DB 연결이 안되어있거나, 로그인 상태가 아닙니다.");
            return;
        }

        let winner = 'DRAW';
        if (game.team_a_score > game.team_b_score) winner = 'A_WIN';
        else if (game.team_b_score > game.team_a_score) winner = 'B_WIN';

        try {
            const { error } = await supabase.from('game_3v3_results').insert([{
                session_id: session.id,
                team_a_name: game.team_a_name,
                team_b_name: game.team_b_name,
                team_a_score: game.team_a_score,
                team_b_score: game.team_b_score,
                winner: winner,
                period: game.period
            }]);

            if (error) throw error;
            
            // 🚀 경기 결과 저장 성공 시 대시보드 렌더링
            const fetched = await fetchResults(session.id);
            setResultsData(fetched);
            setShowResults(true);

        } catch (err) {
            console.error(err);
            alert("테이블 저장에 실패했습니다. (Supabase 3v3_results 테이블 유무 확인 요망)");
        }
    };

    // ── 다음 경기 ──
    const handleNewGame = () => {
        setTimerRunning(false);
        setGame(prev => ({
            ...makeDefaultGame(),
            period: prev.period + 1,
            team_a_name: prev.team_a_name,
            team_b_name: prev.team_b_name,
        }));
    };

    // ── 세션 전환 ──
    const handleSelectSession = (s) => {
        setTimerRunning(false);
        setSession(s);
        setShowSetup(false);
    };

    const handleCreateSession = async () => {
        if (!newSessionTitle.trim() || !isAdmin || !dbReady) return;
        const { data: newSession } = await supabase
            .from('game_3v3_sessions')
            .insert([{ title: newSessionTitle.trim(), status: 'ACTIVE' }])
            .select().single();

        if (newSession) {
            setSession(newSession);
            setNewSessionTitle('');
            setSessions(prev => [newSession, ...prev]);
            setShowSetup(false);
        }
    };

    // ────────────────────────────────────────
    // 렌더링 계산
    // ────────────────────────────────────────
    const timeIsLow  = game.game_time > 0 && game.game_time <= 30;
    const timeIsZero = game.game_time <= 0;
    const gameEnded  = game.status === 'ENDED' || timeIsZero;
    const aWins      = game.team_a_score > game.team_b_score;
    const bWins      = game.team_b_score > game.team_a_score;
    const shotClockZero = game.shot_clock <= 0;

    // 점수 추가 및 타이머 조작은 로그인 상관없이 항상 가능하도록 허용 (패드 로컬 조작 자유도 패치)
    const canControl = true; 

    return (
        <div className={`${styles.scoreboard} ${gameEnded ? styles.ended : timerRunning ? styles.live : ''}`}>
            {/* ── 배경 ── */}
            <div className={styles.bgCourt} />
            <div className={styles.bgGrain} />
            {timeIsLow && !timeIsZero && <div className={styles.dangerPulse} />}
            {gameEnded && <div className={styles.endedOverlayGlow} />}

            {/* ── 헤더 ── */}
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <button className={styles.iconBtn} onClick={() => navigate('/')}>
                        <ArrowLeft size={20} />
                    </button>
                    <div className={styles.sessionLabel}>
                        <span className={styles.sessionLabelTag}>3v3</span>
                        <span className={styles.sessionLabelText}>
                            {session?.title || 'GRIT LAB 3:3 로컬 경기'}
                        </span>
                    </div>
                </div>

                <div className={styles.periodBadge}>
                    <span className={styles.periodText}>GAME {game.period}</span>
                </div>

                <div className={styles.headerRight}>
                    {canControl && (
                        <button className={`${styles.iconBtn} ${styles.saveBtn}`} onClick={handleSaveResult}>
                            <Save size={18} />
                        </button>
                    )}
                    {isAdmin && dbReady && (
                        <button className={styles.iconBtn} onClick={() => setShowSetup(true)}>
                            <Settings size={20} />
                        </button>
                    )}
                </div>
            </header>

            {/* ── 메인 스코어보드 ── */}
            <main className={styles.main}>

                {/* ── 팀 A ── */}
                <div className={`${styles.teamBlock} ${styles.teamA} ${aWins && gameEnded ? styles.winner : ''}`}>
                    <div className={styles.teamNameWrap}>
                        {editingTeam === 'A' ? (
                            <div className={styles.nameEditRow}>
                                <input
                                    className={styles.nameInput}
                                    value={tempName}
                                    onChange={e => setTempName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleTeamNameSave()}
                                    autoFocus
                                />
                                <button className={styles.nameConfirmBtn} onClick={handleTeamNameSave}><Check size={18} /></button>
                            </div>
                        ) : (
                            <div className={styles.teamNameRow} onClick={() => canControl && handleTeamNameEdit('A')} style={{ cursor: canControl ? 'pointer' : 'default' }}>
                                <h2 className={styles.teamNameHuge}>{game.team_a_name}</h2>
                            </div>
                        )}
                        {aWins && gameEnded && <span className={styles.winTag}>WINNER 🏆</span>}
                    </div>

                    <div className={styles.scoreWrap}>
                        <div className={`${styles.scoreGiant} ${timeIsLow && !timeIsZero ? styles.scorePulse : ''}`}
                             {...(canControl ? scoreAHandlers : {})}>
                            {game.team_a_score}
                        </div>
                        {canControl && (
                            <div className={styles.scoreControlsVertical}>
                                <button className={styles.scoreBtnMicro} onClick={(e) => { e.stopPropagation(); handleScoreChange('A', 1); }}><Plus size={18} /></button>
                                <button className={styles.scoreBtnMicro} onClick={(e) => { e.stopPropagation(); handleScoreChange('A', -1); }}><Minus size={18} /></button>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── 중앙: 타이머 & 샷클락 ── */}
                <div className={styles.centerBlock}>
                    {/* 게임클락 */}
                    <div className={styles.timerGroup}>
                        <p className={styles.timerLabel}>GAME CLOCK (TAP: Play/Pause, HOLD: Edit)</p>
                        <div 
                            className={`${styles.timerGiant} ${timeIsLow && !timeIsZero ? styles.timerDanger : ''} ${timeIsZero ? styles.timerZero : ''}`}
                            {...(canControl ? gameClockHandlers : {})}
                            style={{ cursor: canControl ? 'pointer' : 'default' }}
                        >
                            {formatTime(game.game_time)}
                        </div>
                    </div>

                    {/* 샷클락 (3:3은 12초) */}
                    <div className={styles.shotClockGroup}>
                        <p className={styles.timerLabel}>SHOT CLOCK (TAP: Play/Pause, HOLD: 12s)</p>
                        <div 
                            className={`${styles.shotClockGiant} ${shotClockZero ? styles.timerDanger : ''}`}
                            {...(canControl ? shotClockHandlers : {})}
                            style={{ cursor: canControl ? 'pointer' : 'default' }}
                        >
                            {formatShotClock(game.shot_clock)}
                        </div>
                    </div>

                    {/* 게임 종료 후 결과 메시지 */}
                    {gameEnded && <div className={styles.endedLabel}>MATCH FINISHED</div>}
                </div>

                {/* ── 팀 B ── */}
                <div className={`${styles.teamBlock} ${styles.teamB} ${bWins && gameEnded ? styles.winner : ''}`}>
                    <div className={styles.teamNameWrap}>
                        {editingTeam === 'B' ? (
                            <div className={styles.nameEditRow}>
                                <input
                                    className={styles.nameInput}
                                    value={tempName}
                                    onChange={e => setTempName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleTeamNameSave()}
                                    autoFocus
                                />
                                <button className={styles.nameConfirmBtn} onClick={handleTeamNameSave}><Check size={18} /></button>
                            </div>
                        ) : (
                            <div className={styles.teamNameRow} onClick={() => canControl && handleTeamNameEdit('B')} style={{ cursor: canControl ? 'pointer' : 'default' }}>
                                <h2 className={styles.teamNameHuge}>{game.team_b_name}</h2>
                            </div>
                        )}
                        {bWins && gameEnded && <span className={styles.winTag}>WINNER 🏆</span>}
                    </div>

                    <div className={styles.scoreWrap}>
                        <div className={`${styles.scoreGiant} ${timeIsLow && !timeIsZero ? styles.scorePulse : ''}`}
                             {...(canControl ? scoreBHandlers : {})}>
                            {game.team_b_score}
                        </div>
                        {canControl && (
                            <div className={styles.scoreControlsVertical}>
                                <button className={styles.scoreBtnMicro} onClick={(e) => { e.stopPropagation(); handleScoreChange('B', 1); }}><Plus size={18} /></button>
                                <button className={styles.scoreBtnMicro} onClick={(e) => { e.stopPropagation(); handleScoreChange('B', -1); }}><Minus size={18} /></button>
                            </div>
                        )}
                    </div>
                </div>

            </main>

            {/* ── 롱프레스 모달: 시간 설정 ── */}
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
                                setGame(prev => ({ ...prev, game_time: Number.isNaN(newSec) ? 600 : newSec, shot_clock: 12 }));
                                setShowEditTime(false);
                            }}>
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 게임 종료 후 결과 대시보드 모달 ── */}
            {showResults && (
                <div className={styles.resultsOverlay}>
                    <div className={styles.resultsBoard}>
                        <h2 className={styles.resultsTitle}>🏀 대회 결과 (MATCH RESULTS)</h2>
                        <div className={styles.resultsList}>
                            {resultsData.map(res => (
                                <div key={res.id} className={styles.resultItemRow}>
                                    <span className={styles.resPeriod}>GAME {res.period}</span>
                                    <div className={styles.resTeamBox}>
                                        <span className={`${styles.resTeam} ${res.winner === 'A_WIN' ? styles.resWinner : ''}`}>
                                            {res.team_a_name} <strong className={styles.resScore}>{res.team_a_score}</strong>
                                        </span>
                                        <span className={styles.resVs}>VS</span>
                                        <span className={`${styles.resTeam} ${res.winner === 'B_WIN' ? styles.resWinner : ''}`}>
                                            <strong className={styles.resScore}>{res.team_b_score}</strong> {res.team_b_name}
                                        </span>
                                    </div>
                                    <span className={`${styles.resTag} ${res.winner !== 'DRAW' ? styles.resTagWin : ''}`}>
                                        {res.winner === 'A_WIN' ? 'A 승리' : res.winner === 'B_WIN' ? 'B 승리' : '무승부'}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className={styles.resultsFooter}>
                            <div className={styles.countdownText}>다음 경기 시작까지 <span className={styles.countdownNum}>{resultsCountdown}</span>초...</div>
                            <button className={styles.skipBtn} onClick={() => { setShowResults(false); handleNewGame(); }}>
                                ▶️ 바로 시작하기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 어드민 세션 패널 ... 기존과 동일 로직 */}
            {showSetup && isAdmin && dbReady && (
                <div className={styles.setupPanel} onClick={() => setShowSetup(false)}>
                    {/* (생략됨 - 이전 파일과 유사한 UI 처리) */}
                    <div className={styles.setupPanelInner} onClick={e => e.stopPropagation()}>
                        <div className={styles.setupPanelHeader}>
                            <h3 className={styles.setupPanelTitle}>⚙️ 세션 관리</h3>
                            <button className={styles.iconBtn} onClick={() => setShowSetup(false)}><X size={18} /></button>
                        </div>
                        <div className={styles.newSessionForm}>
                            <input className={styles.setupInput} placeholder="새 세션명" value={newSessionTitle} onChange={e => setNewSessionTitle(e.target.value)} />
                            <button className={styles.setupCreateBtn} onClick={handleCreateSession}>만들기</button>
                        </div>
                        <div className={styles.sessionList}>
                            {sessions.map(s => (
                                <button key={s.id} className={styles.sessionItem} onClick={() => handleSelectSession(s)}>
                                    <span className={styles.sessionName}>{s.title}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
