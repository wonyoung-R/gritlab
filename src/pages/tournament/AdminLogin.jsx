import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // 1. 이미 로그인된 세션이 있으면, 바로 토너먼트 리스트로 자동 리다이렉트
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                navigate('/tournament/dashboard');
            }
        });
    }, [navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg('');

        // Supabase Auth SignIn Request
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            setErrorMsg('이메일이나 비밀번호가 일치하지 않습니다.');
            setLoading(false);
        } else {
            // 성공시 토너먼트 컨트롤 패널로 이동
            navigate('/tournament/dashboard');
        }
    };

    return (
        <>
            <div className="bg-container">
                <div className="bg-image"></div>
            </div>
            <div className="content-container text-white flex items-center justify-center min-h-screen">
                <div className="bg-[#111] p-10 rounded-2xl border border-[#333] shadow-2xl max-w-sm w-full relative z-10">

                    <button onClick={() => navigate('/')} className="absolute top-4 left-4 p-2 text-gray-500 hover:text-white transition-colors">
                        <ArrowLeft size={24} />
                    </button>

                    <div className="flex flex-col items-center mb-8 mt-4">
                        <div className="bg-orange-600/20 p-4 rounded-full mb-4 ring-1 ring-orange-500/50">
                            <Lock size={32} className="text-orange-500" />
                        </div>
                        <h2 className="text-2xl font-black italic tracking-tighter text-white">ADMIN LOGIN</h2>
                        <p className="text-sm text-gray-400 mt-2">대회 진행 전용 관리자 로그인</p>
                    </div>

                    <form onSubmit={handleLogin} className="flex flex-col gap-5 relative z-20">
                        <input
                            type="email"
                            placeholder="Admin Email"
                            className="bg-[#222] border border-[#444] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors z-30 relative"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            className="bg-[#222] border border-[#444] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors z-30 relative"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />

                        {errorMsg && <div className="text-red-500 text-sm text-center">{errorMsg}</div>}

                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg transition-colors mt-2 disabled:opacity-50 z-30 relative"
                        >
                            {loading ? '인증 중...' : 'LOGIN'}
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}
