import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trophy, Clock, Target, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PlayZoneFAB() {
    const [isOpen, setIsOpen] = useState(false);
    const [isScrolling, setIsScrolling] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        let scrollTimeout;
        const handleScroll = () => {
            setIsScrolling(true);
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                setIsScrolling(false);
            }, 300);
        };
        window.addEventListener('scroll', handleScroll);
        return () => {
            window.removeEventListener('scroll', handleScroll);
            clearTimeout(scrollTimeout);
        };
    }, []);

    if (location.pathname !== '/') return null;

    const handleNavigate = (path) => {
        setIsOpen(false);
        navigate(path);
    };

    return (
        <div className="fixed bottom-6 right-4 scale-[0.8] origin-bottom-right md:scale-100 md:top-auto md:bottom-[240px] md:right-10 z-[9999] flex flex-col items-end pointer-events-none transition-all duration-500">
            <div className="pointer-events-auto flex flex-col items-end">
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.8 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.8 }}
                            className="mb-4 flex flex-col gap-3"
                        >
                            {/* 3v3 Scoreboard (Future) */}
                            <button
                                onClick={() => alert("3:3 라이브 전광판은 준비 중입니다!")}
                                className="flex items-center gap-3 bg-[#0f172a] text-white px-5 py-3 rounded-full shadow-lg border border-white/10 hover:bg-[#1e293b] transition-colors group"
                            >
                                <span className="font-bold text-sm">3:3 전광판 <span className="text-xs text-gray-400 font-normal ml-1">(준비중)</span></span>
                                <div className="bg-blue-500/20 p-2 rounded-full group-hover:bg-blue-500/40 transition-colors">
                                    <Clock size={16} className="text-blue-400" />
                                </div>
                            </button>

                            {/* 3PT Shootout */}
                            <button
                                onClick={() => handleNavigate('/shootout')}
                                className="flex items-center gap-3 bg-[#0f172a] text-white px-5 py-3 rounded-full shadow-lg border border-white/10 hover:bg-[#1e293b] transition-colors group"
                            >
                                <span className="font-bold text-sm">3점슛 챌린지</span>
                                <div className="bg-orange-500/20 p-2 rounded-full group-hover:bg-orange-500/40 transition-colors">
                                    <Target size={16} className="text-orange-400" />
                                </div>
                            </button>

                            {/* Monthly Ranking (Tournament Admin) */}
                            <button
                                onClick={() => handleNavigate('/tournament/admin')}
                                className="flex items-center gap-3 bg-[#0f172a] text-white px-5 py-3 rounded-full shadow-lg border border-white/10 hover:bg-[#1e293b] transition-colors group"
                            >
                                <span className="font-bold text-sm">월간 챌린지 (대회방)</span>
                                <div className="bg-yellow-500/20 p-2 rounded-full group-hover:bg-yellow-500/40 transition-colors">
                                    <Trophy size={16} className="text-yellow-400" />
                                </div>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={`relative h-16 rounded-full flex items-center justify-center hover:scale-110 transition-all duration-300 overflow-hidden group px-6 gap-3
                        ${isScrolling ? 'opacity-40 scale-95 blur-[1px]' : 'opacity-100 scale-100'}`}
                    style={{
                        backgroundImage: isOpen ? 'none' : 'url(/ball_texture.png)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundColor: isOpen ? '#050505' : '#c05010',
                        border: isOpen ? '2px solid #1e293b' : '2px solid #8a3508',
                        boxShadow: isOpen
                            ? '0 4px 12px rgba(0,0,0,0.4)'
                            : '0 0 28px rgba(200, 90, 20, 0.65), inset 0 0 14px rgba(0,0,0,0.3)'
                    }}
                >
                    {/* Tint overlay for text legibility when ball texture is showing */}
                    {!isOpen && (
                        <div className="absolute inset-0 bg-black/25 group-hover:bg-black/5 transition-colors duration-300 pointer-events-none" />
                    )}

                    {isOpen && (
                        <X size={22} className="text-white relative z-10 shrink-0" />
                    )}
                    <span className="text-white font-black italic tracking-wider text-lg relative z-10 whitespace-nowrap"
                        style={{ textShadow: '0 2px 8px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,1)' }}>
                        {isOpen ? "닫기" : "GRIT ZONE"}
                    </span>

                    {/* Pulse effect when closed */}
                    {!isOpen && (
                        <div
                            className="absolute inset-0 rounded-full animate-ping bg-orange-400/35 opacity-75 pointer-events-none group-hover:animate-none"
                            style={{ animationDuration: '3s' }}
                        />
                    )}
                </button>
            </div>
        </div>
    );
}
