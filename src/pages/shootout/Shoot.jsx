import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from './useStore';
import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Play } from 'lucide-react';
import styles from './shoot.module.css';

export default function ShootPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { players, savePlayerResult } = useStore();
    const player = players.find(p => p.id === id);

    const [mounted, setMounted] = useState(false);
    const [localRacks, setLocalRacks] = useState([]);
    const [activeRackTimer, setActiveRackTimer] = useState(null);
    const [timeLeft, setTimeLeft] = useState(15);
    const [timerRunning, setTimerRunning] = useState(false);

    // Which ball is currently showing its Air Command?
    const [activeBallId, setActiveBallId] = useState(null);

    useEffect(() => {
        if (player) {
            // Use Deep copy for local editing
            setLocalRacks(JSON.parse(JSON.stringify(player.racks)));
            setMounted(true);
        } else if (players.length > 0) {
            navigate('/shootout');
        }
    }, [player, players, navigate]);

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

    // Calculate realtime score
    const currentScore = useMemo(() => {
        let sum = 0;
        localRacks.forEach(r => {
            r.balls.forEach(b => {
                if (b.result === 'SUCCESS') sum += b.points;
            });
        });
        return sum;
    }, [localRacks]);

    if (!mounted || !player) return null;

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
    };

    const handleSaveAndExit = () => {
        savePlayerResult(player.id, localRacks, currentScore);
        navigate('/shootout');
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
                        <button className="hover:bg-white/10 p-2 rounded-full transition-colors flex gap-2 items-center" onClick={() => navigate('/shootout')}>
                            <ArrowLeft size={24} /> <span className="hidden md:inline">뒤로가기</span>
                        </button>
                        <div className={styles.playerInfo}>
                            <h2>{player.name}</h2>
                            <span className={styles.scoreBadge}>{currentScore} 점</span>
                        </div>
                        <button className={styles.saveBtn} onClick={handleSaveAndExit}>
                            기록 저장
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
