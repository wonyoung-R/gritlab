import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { LogOut, Plus, Trophy, ChevronRight, AlertCircle, Users, Target } from 'lucide-react';

export default function TournamentDashboard() {
    const navigate = useNavigate();
    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newType, setNewType] = useState('3PT'); // '3PT' | '3V3'

    useEffect(() => {
        checkSessionAndFetchData();
    }, []);

    const checkSessionAndFetchData = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            navigate('/tournament/admin');
            return;
        }
        fetchTournaments();
    };

    const fetchTournaments = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('tournaments')
            .select(`
                id,
                title,
                type,
                status,
                created_at,
                player_count:players(count)
            `)
            .order('created_at', { ascending: false });

        if (!error && data) {
            // Count array to number
            const formatted = data.map(t => ({
                ...t,
                players_count: t.player_count[0]?.count || 0,
                // fallback to 3PT if type is null for existing records
                type: t.type || '3PT'
            }));
            setTournaments(formatted);
        } else {
            console.error("fetch err", error)
        }
        setLoading(false);
    };

    const handleCreateTournament = async (e) => {
        e.preventDefault();
        if (!newTitle.trim()) return;

        setIsCreating(true);
        try {
            const { data, error } = await supabase
                .from('tournaments')
                .insert([{ title: newTitle.trim(), type: newType, status: 'ACTIVE' }])
                .select();

            if (error) {
                console.error("Error creating tournament:", error);

                // fallback warning
                if (error.message.includes('column "type" of relation "tournaments" does not exist')) {
                    alert("데이터베이스에 'type' 컬럼이 아직 없습니다! \n먼저 Supabase SQL 스크립트를 실행해 주세요.");
                } else {
                    alert("대회 생성에 실패했습니다.");
                }
                return;
            }

            if (data && data.length > 0) {
                setNewTitle('');
                setNewType('3PT');
                // 만약 3V3 대회라면 더미 참가자를 생성하지 않거나 다르게 생성하는 등 로직 분리가 가능합니다.
                // 여기서는 우선 일관되게 15명을 생성하도록 유지합니다.
                await generateInitialPlayers(data[0].id);
                await fetchTournaments();
            }
        } catch (err) {
            console.error("Unexpected error:", err);
        } finally {
            setIsCreating(false);
        }
    };

    const generateInitialPlayers = async (tournamentId) => {
        const dummyPlayers = Array.from({ length: 15 }).map((_, i) => ({
            tournament_id: tournamentId,
            name: `참가자 ${i + 1}`,
            rank_order: i,
            total_score: 0,
            is_completed: false
        }));
        await supabase.from('players').insert(dummyPlayers);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = 'https://www.grit-lab.kr';
    };

    return (
        <div className="bg-[#050505] min-h-screen text-white p-6 md:p-12 relative overflow-hidden">
            {/* Background Accent */}
            <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-600/10 blur-[120px] rounded-full pointer-events-none"></div>

            <header className="flex justify-between items-end mb-12 border-b border-white/10 pb-6 relative z-10">
                <div>
                    <h1 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
                        GRIT LAB ADMIN
                    </h1>
                    <p className="text-gray-400 mt-2 font-medium">Tournament Management Dashboard</p>
                </div>
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors bg-white/5 px-4 py-2 rounded-lg"
                >
                    <LogOut size={18} />
                    <span className="text-sm font-bold">Logout</span>
                </button>
            </header>

            <main className="max-w-5xl mx-auto relative z-10">
                {/* Create New Tournament Card */}
                <div className="bg-[#111] border border-[#333] rounded-xl p-6 mb-10 shadow-2xl">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Plus size={20} className="text-orange-500" /> 새로운 대회(세션) 열기
                    </h2>
                    <form onSubmit={handleCreateTournament} className="flex flex-col md:flex-row gap-4">
                        <input
                            type="text"
                            placeholder="ex) 2026년 3월 G3IT LAB 챌린지"
                            className="flex-1 bg-[#222] border border-[#444] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            disabled={isCreating}
                        />
                        <select
                            value={newType}
                            onChange={(e) => setNewType(e.target.value)}
                            disabled={isCreating}
                            className="bg-[#222] border border-[#444] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                        >
                            <option value="3PT">🎯 3점슛 대회</option>
                            <option value="3V3">🏀 3:3 대회</option>
                        </select>
                        <button
                            type="submit"
                            disabled={isCreating || !newTitle.trim()}
                            className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-3 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                            {isCreating ? '생성 중...' : '대회 방 만들기'}
                        </button>
                    </form>
                </div>

                {/* Tournament List */}
                <h3 className="text-lg font-bold mb-6 text-gray-300">진행 중인 대회 목록</h3>

                {loading ? (
                    <div className="text-center py-12 text-gray-500">데이터를 불러오는 중입니다...</div>
                ) : tournaments.length === 0 ? (
                    <div className="bg-[#111] border border-dashed border-[#444] rounded-xl p-12 flex flex-col items-center justify-center text-gray-500">
                        <AlertCircle size={48} className="mb-4 opacity-50" />
                        <p>생성된 대회가 없습니다. 위의 폼에서 새 대회를 열어주세요.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {tournaments.map((t) => (
                            <div
                                key={t.id}
                                className="bg-[#1a1a1a] border border-[#333] hover:border-orange-500/50 rounded-xl p-6 transition-all hover:transform hover:-translate-y-1 cursor-pointer group flex flex-col"
                                onClick={() => navigate(t.type === '3V3' ? `/tournament/manage-3v3/${t.id}` : `/tournament/manage/${t.id}`)}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`p-3 rounded-lg transition-transform group-hover:scale-110 ${t.type === '3V3' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                        {t.type === '3V3' ? <Users size={24} /> : <Target size={24} />}
                                    </div>
                                    <div className="flex gap-2">
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${t.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                            {t.status === 'ACTIVE' ? '진행중' : '종료됨'}
                                        </span>
                                    </div>
                                </div>
                                <h4 className="flex items-center gap-2 text-xl font-bold mb-2 text-white group-hover:text-orange-400 transition-colors line-clamp-2">
                                    <span className="text-sm border border-gray-600 px-2 py-0.5 rounded text-gray-300">
                                        {t.type === '3V3' ? '3:3' : '3PT'}
                                    </span>
                                    {t.title}
                                </h4>
                                <div className="flex justify-between items-center mt-auto pt-4 border-t border-[#333] text-sm text-gray-500">
                                    <span>참가자: {t.players_count}명</span>
                                    <div className="flex items-center gap-1 text-gray-400 group-hover:text-orange-400 transition-colors">
                                        관리하기 <ChevronRight size={16} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
