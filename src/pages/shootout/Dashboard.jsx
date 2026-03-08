import { useNavigate } from 'react-router-dom';
import { useStore } from './useStore';
import { ChevronUp, ChevronDown, RotateCcw, ArrowLeft } from 'lucide-react';
import styles from './page.module.css';
import { useEffect, useState } from 'react';

export default function Dashboard() {
    const navigate = useNavigate();
    const { players, updatePlayerOrder, updatePlayerName, resetAll } = useStore();

    // To avoid hydration mismatch due to zustand persist
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    return (
        <>
            <div className="bg-container">
                <div className="bg-image"></div>
                <div className="moving-text-container">
                    <h1 className="moving-text">GRIT LAB GRIT LAB GRIT LAB</h1>
                </div>
            </div>
            <div className="content-container text-white">
                <main className={styles.main}>
                    <header className={styles.header}>
                        <div className="flex items-center gap-4">
                            <button onClick={() => navigate('/')} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                                <ArrowLeft size={24} color="#aaa" />
                            </button>
                            <h1>G3IT LAB 3Point Competition</h1>
                        </div>
                        <div className={styles.headerRight}>
                            <div className={styles.summary}>
                                진행 완료: {players.filter(p => p.completed).length} / 20
                            </div>
                            <button
                                className={styles.resetBtn}
                                onClick={() => {
                                    if (confirm('모든 기록과 참가자 정보가 초기화됩니다. 계속하시겠습니까?')) {
                                        resetAll();
                                    }
                                }}
                            >
                                <RotateCcw size={16} /> 전체 초기화
                            </button>
                        </div>
                    </header>

                    <div className={styles.playerList}>
                        {players.map((player, index) => (
                            <div key={player.id} className={`${styles.playerCard} ${player.completed ? styles.completed : ''}`}>
                                <div className={styles.rank}>{index + 1}</div>

                                <div className={styles.actions}>
                                    <button
                                        disabled={index === 0}
                                        onClick={() => updatePlayerOrder(index, index - 1)}
                                        className={styles.iconBtn}
                                    >
                                        <ChevronUp />
                                    </button>
                                    <button
                                        disabled={index === players.length - 1}
                                        onClick={() => updatePlayerOrder(index, index + 1)}
                                        className={styles.iconBtn}
                                    >
                                        <ChevronDown />
                                    </button>
                                </div>

                                <input
                                    className={styles.nameInput}
                                    value={player.name}
                                    onChange={(e) => updatePlayerName(player.id, e.target.value)}
                                    placeholder="참가자 이름"
                                />

                                <div className={styles.scoreContainer}>
                                    {player.completed ? (
                                        <div className={styles.score}>
                                            {player.totalScore} <span>점</span>
                                        </div>
                                    ) : (
                                        <div className={styles.pending}>대기중</div>
                                    )}
                                </div>

                                <button
                                    className={styles.shootBtn}
                                    onClick={() => navigate(`/shootout/shoot/${player.id}`)}
                                    style={{ background: player.completed ? '#4b5563' : 'var(--primary)' }}
                                >
                                    {player.completed ? '결과 보기 / 재시도' : '시작하기'}
                                </button>
                            </div>
                        ))}
                    </div>
                </main>
            </div>
        </>
    );
}
