import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Trophy, Medal, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ROUND_LABELS = {
    GROUP_A: '예선 A',
    GROUP_B: '예선 B',
    QUARTER: '8강',
    SEMI: '4강',
    '3RD_PLACE': '3위전',
    FINAL: '결승',
};

const ROUND_ORDER = ['GROUP_A', 'GROUP_B', 'QUARTER', 'SEMI', '3RD_PLACE', 'FINAL'];

export default function TournamentLeaderboard() {
    const navigate = useNavigate();
    const [tournaments, setTournaments] = useState([]);
    const [activeTournamentId, setActiveTournamentId] = useState(null);
    const [players, setPlayers] = useState([]);
    const [brackets, setBrackets] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch all tournaments on load (SHOOTOUT + 3V3 모두)
    useEffect(() => {
        const fetchTournaments = async () => {
            const { data, error } = await supabase
                .from('tournaments')
                .select('id, title, type, status, created_at')
                .order('created_at', { ascending: false });

            if (!error && data) {
                setTournaments(data);
                if (data.length > 0) {
                    setActiveTournamentId(data[0].id);
                }
            }
            setLoading(false);
        };
        fetchTournaments();
    }, []);

    const activeTournamentInfo = tournaments.find(t => t.id === activeTournamentId);
    const is3v3 = activeTournamentInfo?.type === '3V3';

    // Fetch data when active tournament changes
    useEffect(() => {
        if (!activeTournamentId) return;

        if (is3v3) {
            fetchBrackets();
        } else {
            fetchPlayers();
        }
    }, [activeTournamentId, is3v3]);

    const fetchPlayers = async () => {
        const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('tournament_id', activeTournamentId)
            .order('total_score', { ascending: false })
            .order('rank_order', { ascending: true });

        if (!error && data) {
            setPlayers(data);
        }

        // Realtime for shootout
        const channel = supabase
            .channel('public:players')
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'players', filter: `tournament_id=eq.${activeTournamentId}` },
                () => fetchPlayers()
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    };

    const fetchBrackets = async () => {
        const { data, error } = await supabase
            .from('game_3v3_brackets')
            .select('*')
            .eq('tournament_id', activeTournamentId)
            .order('match_order', { ascending: true });

        if (!error && data) {
            setBrackets(data);
        }
    };

    const getMedalColor = (index) => {
        if (index === 0) return 'text-yellow-400';
        if (index === 1) return 'text-gray-300';
        if (index === 2) return 'text-amber-600';
        return 'text-gray-600';
    };

    // 3v3 대진표를 라운드별로 그룹화
    const bracketsByRound = ROUND_ORDER
        .filter(r => brackets.some(b => b.round === r))
        .map(r => ({
            round: r,
            label: ROUND_LABELS[r] || r,
            matches: brackets.filter(b => b.round === r),
        }));

    return (
        <div className="bg-[#050505] min-h-screen text-white p-6 md:p-12 relative overflow-hidden font-pretendard">
            {/* Background Accent */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-orange-600/10 blur-[150px] rounded-full pointer-events-none"></div>

            <div className="max-w-4xl mx-auto relative z-10">
                <header className="flex flex-col md:flex-row md:justify-between md:items-end mb-10 border-b border-white/10 pb-6 gap-4">
                    <div>
                        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white flex items-center gap-2 mb-4 transition-colors">
                            <ArrowLeft size={16} /> 메인으로 돌아가기
                        </button>
                        <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-600 flex items-center gap-3">
                            HALL OF FAME <Trophy size={36} className="text-orange-500" />
                        </h1>
                        <p className="text-gray-400 mt-2 font-medium">그릿랩 월간 챌린지 공식 명예의 전당 (실시간 연동중)</p>
                    </div>

                    {/* Tournament Selector — 전체 대회(SHOOTOUT + 3V3) 표시 */}
                    {tournaments.length > 0 && (
                        <div className="flex flex-col">
                            <label className="text-xs text-gray-500 mb-2 uppercase tracking-widest">Select Season</label>
                            <select
                                className="appearance-none bg-[#111] border border-[#333] hover:border-[#555] rounded-xl px-5 py-3 pr-10 text-white font-medium focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all shadow-xl cursor-pointer"
                                style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'right 12px center',
                                    backgroundSize: '16px'
                                }}
                                value={activeTournamentId || ''}
                                onChange={(e) => setActiveTournamentId(e.target.value)}
                            >
                                {tournaments.map(t => (
                                    <option key={t.id} value={t.id} className="bg-[#111] text-white py-2">
                                        {t.type === '3V3' ? '[3v3] ' : '[3PT] '}{t.title} {t.status === 'ACTIVE' ? '(진행중)' : '(종료됨)'}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </header>

                <main>
                    {loading ? (
                        <div className="text-center py-20 text-gray-500">데이터를 불러오는 중입니다...</div>
                    ) : is3v3 ? (
                        /* ══ 3v3 대진표 뷰 ══ */
                        bracketsByRound.length === 0 ? (
                            <div className="bg-[#111] border border-dashed border-[#444] rounded-xl p-12 text-center text-gray-500">
                                아직 등록된 3v3 경기가 없습니다.
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* 가로 스크롤 브래킷 */}
                                <div className="bg-[#0f0f0f] border border-[#222] rounded-2xl p-6 overflow-x-auto shadow-2xl">
                                    <div className="flex gap-8 min-w-max">
                                        {bracketsByRound.map(({ round, label, matches }) => (
                                            <div key={round} className="flex flex-col gap-3 min-w-[220px]">
                                                <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest text-center pb-2 border-b border-white/10">
                                                    {label}
                                                </h3>
                                                {matches.map(match => (
                                                    <div
                                                        key={match.id}
                                                        className={`border rounded-lg overflow-hidden text-sm ${
                                                            match.status === 'ENDED' ? 'border-white/15' : 'border-white/8'
                                                        }`}
                                                    >
                                                        <div className={`flex items-center justify-between px-4 py-3 ${
                                                            match.winner === 'A_WIN'
                                                                ? 'bg-orange-500/15 text-white font-bold'
                                                                : 'bg-white/3 text-gray-400'
                                                        }`}>
                                                            <span className="truncate max-w-[140px]">{match.team_a_name || 'TBD'}</span>
                                                            <span className="font-black text-lg ml-2">{match.team_a_score}</span>
                                                        </div>
                                                        <div className={`flex items-center justify-between px-4 py-3 border-t border-white/5 ${
                                                            match.winner === 'B_WIN'
                                                                ? 'bg-orange-500/15 text-white font-bold'
                                                                : 'bg-white/3 text-gray-400'
                                                        }`}>
                                                            <span className="truncate max-w-[140px]">{match.team_b_name || 'TBD'}</span>
                                                            <span className="font-black text-lg ml-2">{match.team_b_score}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* 경기 리스트 (상세) */}
                                <div className="bg-[#0f0f0f] border border-[#222] rounded-2xl overflow-hidden shadow-2xl">
                                    <div className="grid grid-cols-12 gap-4 p-4 border-b border-[#222] text-xs text-gray-500 font-bold uppercase tracking-wider bg-[#151515]">
                                        <div className="col-span-2 text-center">Round</div>
                                        <div className="col-span-7 text-center">Match</div>
                                        <div className="col-span-3 text-center">Result</div>
                                    </div>
                                    <div className="divide-y divide-[#1a1a1a]">
                                        {brackets.map(match => (
                                            <div key={match.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-[#1a1a1a] transition-colors">
                                                <div className="col-span-2 text-center">
                                                    <span className="text-xs font-bold text-orange-400/70">{ROUND_LABELS[match.round] || match.round}</span>
                                                </div>
                                                <div className="col-span-7 flex items-center justify-center gap-3">
                                                    <span className={`font-bold ${match.winner === 'A_WIN' ? 'text-white' : 'text-gray-400'}`}>
                                                        {match.team_a_name || 'TBD'}
                                                    </span>
                                                    <span className="font-black text-lg text-orange-400">
                                                        {match.team_a_score} - {match.team_b_score}
                                                    </span>
                                                    <span className={`font-bold ${match.winner === 'B_WIN' ? 'text-white' : 'text-gray-400'}`}>
                                                        {match.team_b_name || 'TBD'}
                                                    </span>
                                                </div>
                                                <div className="col-span-3 text-center">
                                                    {match.winner ? (
                                                        <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">
                                                            {match.winner === 'A_WIN' ? match.team_a_name : match.team_b_name} WIN
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-gray-600">대기중</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )
                    ) : (
                        /* ══ 3점슛 리더보드 뷰 (기존) ══ */
                        players.length === 0 ? (
                            <div className="bg-[#111] border border-dashed border-[#444] rounded-xl p-12 text-center text-gray-500">
                                아직 참가자 기록이 존재하지 않습니다.
                            </div>
                        ) : (
                            <div className="bg-[#0f0f0f] border border-[#222] rounded-2xl overflow-hidden shadow-2xl">
                                <div className="grid grid-cols-12 gap-4 p-4 border-b border-[#222] text-xs text-gray-500 font-bold uppercase tracking-wider bg-[#151515]">
                                    <div className="col-span-2 text-center">Rank</div>
                                    <div className="col-span-6">Player Name</div>
                                    <div className="col-span-4 text-right pr-4">Total Score</div>
                                </div>

                                <div className="divide-y divide-[#1a1a1a]">
                                    {players.map((player, index) => {
                                        const isTop3 = index < 3;

                                        return (
                                            <div key={player.id} className={`grid grid-cols-12 gap-4 p-4 items-center transition-colors hover:bg-[#1a1a1a] ${index === 0 ? 'bg-orange-500/5' : ''}`}>
                                                <div className="col-span-2 text-center flex justify-center items-center">
                                                    {isTop3 ? (
                                                        <div className={`p-2 rounded-full bg-[#111] border border-[#333] shadow-lg ${getMedalColor(index)}`}>
                                                            <Medal size={24} />
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-500 font-bold text-lg w-10 text-center">{index + 1}</span>
                                                    )}
                                                </div>

                                                <div className="col-span-6 flex items-center gap-3">
                                                    <span className={`font-bold ${isTop3 ? 'text-xl text-white' : 'text-lg text-gray-300'}`}>
                                                        {player.name}
                                                    </span>
                                                    {!player.is_completed && activeTournamentInfo?.status === 'ACTIVE' && (
                                                        <span className="text-[10px] bg-red-500/20 text-red-500 px-2 py-1 rounded font-bold animate-pulse">
                                                            LIVE
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="col-span-4 text-right pr-4 flex flex-col items-end justify-center">
                                                    <div className={`font-black italic tracking-tighter ${isTop3 ? 'text-3xl text-orange-400' : 'text-2xl text-gray-400'}`}>
                                                        {player.total_score}
                                                    </div>
                                                    <span className="text-[10px] text-gray-600 font-bold">PTS</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    )}
                </main>
            </div>
        </div>
    );
}
