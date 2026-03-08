import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, ArrowLeft, Trophy, Plus, Trash2 } from 'lucide-react';
import styles from '../shootout/page.module.css';

export default function TournamentManage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [tournament, setTournament] = useState(null);
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkSessionAndFetchData();

        // Setup realtime subscription
        const channel = supabase
            .channel('players_changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'players', filter: `tournament_id=eq.${id}` },
                () => {
                    fetchPlayers(); // simplistic refresh
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [id]);

    const checkSessionAndFetchData = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            navigate('/tournament/admin');
            return;
        }
        await Promise.all([fetchTournament(), fetchPlayers()]);
        setLoading(false);
    };

    const fetchTournament = async () => {
        const { data } = await supabase.from('tournaments').select('*').eq('id', id).single();
        if (data) setTournament(data);
    };

    const fetchPlayers = async () => {
        const { data } = await supabase
            .from('players')
            .select('*')
            .eq('tournament_id', id)
            .order('rank_order', { ascending: true });

        if (data) setPlayers(data);
    };

    const handleUpdateName = async (playerId, newName) => {
        // Optimistic update
        setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, name: newName } : p));
        // DB upload
        await supabase.from('players').update({ name: newName }).eq('id', playerId);
    };

    const handleMoveOrder = async (index, direction) => {
        if (
            (direction === -1 && index === 0) ||
            (direction === 1 && index === players.length - 1)
        ) return;

        const newPlayers = [...players];
        const a = newPlayers[index];
        const b = newPlayers[index + direction];

        // Swap rank_order
        const tempRank = a.rank_order;
        a.rank_order = b.rank_order;
        b.rank_order = tempRank;

        // update DB
        await supabase.from('players').upsert([
            { id: a.id, rank_order: a.rank_order },
            { id: b.id, rank_order: b.rank_order }
        ]);

        fetchPlayers();
    };

    const handleAddPlayer = async () => {
        const newOrder = players.length > 0 ? Math.max(...players.map(p => p.rank_order)) + 1 : 0;
        const newPlayer = {
            tournament_id: id,
            name: `새 참가자`,
            rank_order: newOrder,
            total_score: 0,
            is_completed: false
        };

        const { error } = await supabase.from('players').insert([newPlayer]);
        if (!error) {
            fetchPlayers();
        } else {
            console.error("Error adding player", error)
        }
    };

    const handleRemovePlayer = async (playerId) => {
        if (confirm("정말 이 참가자를 삭제하시겠습니까? (기록도 함께 삭제됩니다)")) {
            const { error } = await supabase.from('players').delete().eq('id', playerId);
            if (!error) {
                fetchPlayers();
            } else {
                console.error("Error deleting player", error)
            }
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;
    }

    if (!tournament) {
        return <div className="min-h-screen bg-black text-white flex items-center justify-center">대회 정보를 찾을 수 없습니다.</div>;
    }

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
                            <button onClick={() => navigate('/tournament/dashboard')} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                                <ArrowLeft size={24} color="#aaa" />
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="bg-orange-500/20 p-2 rounded-lg text-orange-400">
                                    <Trophy size={20} />
                                </div>
                                <h1 className="flex flex-col">
                                    <span className="text-sm font-normal text-gray-400">대회방 관리</span>
                                    {tournament.title}
                                </h1>
                            </div>
                        </div>
                        <div className={styles.headerRight}>
                            <div className={styles.summary}>
                                참가자 수: {players.length}명
                            </div>
                            <button
                                className="flex items-center gap-2 bg-[#333] hover:bg-[#444] text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                                onClick={handleAddPlayer}
                            >
                                <Plus size={16} /> 참가자 추가
                            </button>
                        </div>
                    </header>

                    <div className={styles.playerList}>
                        {players.map((player, index) => (
                            <div key={player.id} className={`${styles.playerCard} ${player.is_completed ? styles.completed : ''}`}>
                                <div className={styles.rank}>{index + 1}</div>

                                <div className={styles.actions}>
                                    <button
                                        disabled={index === 0}
                                        onClick={() => handleMoveOrder(index, -1)}
                                        className={styles.iconBtn}
                                    >
                                        <ChevronUp />
                                    </button>
                                    <button
                                        disabled={index === players.length - 1}
                                        onClick={() => handleMoveOrder(index, 1)}
                                        className={styles.iconBtn}
                                    >
                                        <ChevronDown />
                                    </button>
                                </div>

                                <input
                                    className={styles.nameInput}
                                    value={player.name}
                                    onChange={(e) => setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, name: e.target.value } : p))}
                                    onBlur={(e) => handleUpdateName(player.id, e.target.value)}
                                    placeholder="참가자 이름"
                                />

                                <div className={styles.scoreContainer}>
                                    {player.is_completed ? (
                                        <div className={styles.score}>
                                            {player.total_score} <span>점</span>
                                        </div>
                                    ) : (
                                        <div className={styles.pending}>대기중</div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        className={styles.shootBtn}
                                        onClick={() => navigate(`/tournament/shoot/${player.id}`)}
                                        style={{ background: player.is_completed ? '#4b5563' : 'var(--primary)', flex: 1 }}
                                    >
                                        {player.is_completed ? '결과 확인' : '슈팅 모드'}
                                    </button>
                                    <button
                                        onClick={() => handleRemovePlayer(player.id)}
                                        className="p-3 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/30 transition-colors shrink-0"
                                        title="참가자 삭제"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </main>
            </div>
        </>
    );
}
