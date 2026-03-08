import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Play, Save } from 'lucide-react';
import styles from '../shootout/shoot.module.css';

const generateInitialRacks = () => {
    const racks = [];
    for (let r = 1; r <= 5; r++) {
        racks.push({
            id: `rack${r}`,
            type: 'NORMAL',
            balls: [
                { id: `r${r}_b1`, points: 1, result: null },
                { id: `r${r}_b2`, points: 1, result: null },
                { id: `r${r}_b3`, points: 1, result: null },
                { id: `r${r}_b4`, points: 1, result: null },
                { id: `r${r}_m5`, points: 2, result: null },
            ]
        });
    }
    // Deep 3 rack
    racks.push({
        id: `deep3`,
        type: 'DEEP3',
        balls: [
            { id: `d3_1`, points: 3, result: null },
            { id: `d3_2`, points: 3, result: null },
        ]
    });
    return racks;
};

export default function TournamentShootPage() {
    const { playerId } = useParams();
    const navigate = useNavigate();

    const [mounted, setMounted] = useState(false);
    const [player, setPlayer] = useState(null);
    const [localRacks, setLocalRacks] = useState([]);

    // Timer states
    const [activeRackTimer, setActiveRackTimer] = useState(null);
    const [timeLeft, setTimeLeft] = useState(15);
    const [timerRunning, setTimerRunning] = useState(false);

    // Which ball is showing air command?
    const [activeBallId, setActiveBallId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line
    }, [playerId]);

    const fetchData = async () => {
        // 1. Get Player basic info
        const { data: pData } = await supabase
            .from('players')
            .select('*')
            .eq('id', playerId)
            .single();

        if (pData) {
            setPlayer(pData);

            // 2. Get Rack data
            const { data: rData } = await supabase
                .from('player_racks')
                .select('*')
                .eq('player_id', playerId)
                .single();

            if (rData && rData.racks_data) {
                setLocalRacks(rData.racks_data);
            } else {
                // Initial generation if never played
                setLocalRacks(generateInitialRacks());
            }
            setMounted(true);
        } else {
            console.error("Player not found");
            navigate('/tournament/dashboard');
        }
    };

    // Auto-save function for seamless DB sync without explicit save
    const autoSaveRacksToDB = async (latestRacks) => {
        const { error } = await supabase.from('player_racks').upsert({
            player_id: playerId,
            racks_data: latestRacks,
            updated_at: new Date()
        }, { onConflict: 'player_id' });

        if (error) console.error("Auto-save error", error);
    };

    // Timer Effect
    useEffect(() => {
        let interval;
        if (timerRunning && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft(t => t - 1);
            }, 1000);
        } else if (timeLeft === 0 && timerRunning) {
            setTimerRunning(false);
        }
        return () => clearInterval(interval);
    }, [timerRunning, timeLeft]);

    // Realtime Score Calculation
    const currentScore = useMemo(() => {
        let sum = 0;
        localRacks.forEach(r => {
            r.balls.forEach(b => {
                if (b.result === 'SUCCESS') sum += b.points;
            });
        });
        return sum;
    }, [localRacks]);

    if (!mounted || !player) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading Data...</div>;

    const handleStartTimer = (rackId) => {
        setActiveRackTimer(rackId);
        setTimeLeft(15);
        setTimerRunning(true);
    };

    const handleBallResult = (rackIndex, ballIndex, result) => {
        const freshRacks = [...localRacks];
        freshRacks[rackIndex].balls[ballIndex].result = result;
        setLocalRacks(freshRacks);
        setActiveBallId(null); // close air command

        // Background auto save on every touch
        autoSaveRacksToDB(freshRacks);
    };

    const handleSaveAndExit = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            // Ensure racks are strictly saved
            await autoSaveRacksToDB(localRacks);

            // Update player compilation status
            await supabase.from('players').update({
                total_score: currentScore,
                is_completed: true
            }).eq('id', playerId);

            // Navigate back to Tournament Manager
            navigate(`/tournament/manage/${player.tournament_id}`);
        } catch (error) {
            console.error(error);
            alert("저장 중 오류가 발생했습니다.");
            setIsSaving(false);
        }
    };

    const BasketballImage = ({ type, result }) => {
        const isSuccess = result === 'SUCCESS';
        const isFail = result === 'FAIL';

        let imgSrc = '/ball_normal.png';
        if (type === 'MONEY') imgSrc = '/ball_money.png';
        if (type === 'DEEP3') imgSrc = '/ball_deep3.png';

        return (
            <div className={styles.basketballWrapper}>
                <img src={imgSrc} alt={`${type} ball`} className={styles.basketballImg} />
                {isSuccess && <div className={styles.successOverlay}>O</div>}
                {isFail && <div className={styles.failOverlay}>X</div>}
            </div>
        );
    };

    return (
        <>
            <div className="bg-container">
                <div className="bg-image"></div>
                <div className="moving-text-container">
                    <h1 className="moving-text">GRIT LAB GRIT LAB GRIT LAB</h1>
                </div>
            </div>
            <div className="content-container text-white">
                {timerRunning && timeLeft <= 5 && timeLeft > 0 && (
                    <div className={styles.dangerOverlay} />
                )}
                <main className={styles.main}>
                    <header className={styles.header}>
                        <button
                            className="hover:bg-white/10 p-2 rounded-full transition-colors flex gap-2 items-center text-gray-400 hover:text-white"
                            onClick={() => navigate(`/tournament/manage/${player.tournament_id}`)}
                        >
                            <ArrowLeft size={24} /> <span className="hidden md:inline">관리자 대시보드</span>
                        </button>
                        <div className={styles.playerInfo}>
                            <h2>{player.name}</h2>
                            <span className={styles.scoreBadge}>{currentScore} 점</span>
                        </div>
                        <button
                            className={`${styles.saveBtn} flex gap-2 items-center`}
                            onClick={handleSaveAndExit}
                            disabled={isSaving}
                        >
                            <Save size={18} /> {isSaving ? '저장 중...' : '기록 확정 (종료)'}
                        </button>
                    </header>

                    {/* Racks grid */}
                    <div className={styles.racksGrid}>
                        {localRacks.map((rack, rIndex) => {
                            const isDeep3 = rack.type === 'DEEP3';
                            const isTimerActive = activeRackTimer === rack.id;

                            return (
                                <div key={rack.id} className={`${styles.rackCard} ${isDeep3 ? styles.deep3card : ''}`}>
                                    <div className={styles.rackContent}>
                                        <div className={styles.rackLeft}>
                                            <h3>{isDeep3 ? '🔥 DEEP THREE Zone (3점)' : `📍 Rack ${rIndex + 1}`}</h3>

                                            {!isDeep3 && (
                                                <button
                                                    className={`${styles.timerStartBtn} ${isTimerActive && timerRunning ? styles.running : ''} ${isTimerActive && timeLeft <= 5 && timeLeft > 0 ? styles.critical : ''} ${isTimerActive && timeLeft === 0 ? styles.finished : ''}`}
                                                    onClick={() => handleStartTimer(rack.id)}
                                                >
                                                    <Play size={24} fill="currentColor" />
                                                    <span>
                                                        {isTimerActive ? (timerRunning ? `00:${timeLeft.toString().padStart(2, '0')}` : '종료') : '15초 시작'}
                                                    </span>
                                                </button>
                                            )}
                                        </div>

                                        <div className={styles.ballsRow}>
                                            {rack.balls.map((ball, bIndex) => {
                                                const isMoneyBall = ball.points === 2;
                                                const isDeep3Ball = ball.points === 3;
                                                const isAirCommandOpen = activeBallId === ball.id;
                                                const type = isMoneyBall ? 'MONEY' : isDeep3Ball ? 'DEEP3' : 'NORMAL';

                                                return (
                                                    <div className={styles.ballContainer} key={ball.id}>
                                                        <button
                                                            className={`${styles.ball} ${ball.result === 'SUCCESS' ? styles.successValue : ''}`}
                                                            onClick={() => {
                                                                if (isAirCommandOpen) setActiveBallId(null);
                                                                else setActiveBallId(ball.id);
                                                            }}
                                                        >
                                                            <BasketballImage type={type} result={ball.result} />
                                                        </button>

                                                        {/* Air Command */}
                                                        {isAirCommandOpen && (
                                                            <div className={styles.airCommand}>
                                                                <button className={styles.airSuccess} onClick={() => handleBallResult(rIndex, bIndex, 'SUCCESS')}>
                                                                    성공
                                                                </button>
                                                                <button className={styles.airFail} onClick={() => handleBallResult(rIndex, bIndex, 'FAIL')}>
                                                                    실패
                                                                </button>
                                                                <button className={styles.airUndo} onClick={() => handleBallResult(rIndex, bIndex, null)}>
                                                                    취소
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </main>
            </div>
        </>
    );
}
