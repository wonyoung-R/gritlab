import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import ShootoutDashboard from './pages/shootout/Dashboard';
import ShootoutGame from './pages/shootout/Shoot';
import TournamentManage from './pages/tournament/Manage';
import TournamentShootPage from './pages/tournament/Shoot';
import TournamentLeaderboard from './pages/tournament/Leaderboard';
import ThreeVThreeScoreboard from './pages/threevthree/Scoreboard';
import ThreeVThreeAdmin from './pages/threevthree/Admin';
import PlayZoneFAB from './components/PlayZoneFAB';

// 구 대회관리(AdminLogin/Dashboard, 예전 디자인)는 grit-login.html → tournament.html로 대체됨.
// 옛 북마크/링크가 SPA 404 폴백을 타고 들어오면 새 시스템으로 보낸다.
// (tournament.html이 세션 없으면 grit-login.html로 다시 보내므로 로그인 흐름도 이어짐)
function RedirectToNewAdmin() {
    useEffect(() => { window.location.replace('/tournament.html'); }, []);
    return null;
}

export default function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Landing />} />

                {/* 공개 리더보드 (대회기록) */}
                <Route path="/records" element={<TournamentLeaderboard />} />

                {/* 기존 연습용 로컬 버전 */}
                <Route path="/shootout" element={<ShootoutDashboard />} />
                <Route path="/shootout/shoot/:id" element={<ShootoutGame />} />

                {/* 구 대회관리 진입점 → 새 시스템(tournament.html)으로 리다이렉트 */}
                <Route path="/tournament" element={<RedirectToNewAdmin />} />
                <Route path="/tournament/admin" element={<RedirectToNewAdmin />} />
                <Route path="/tournament/dashboard" element={<RedirectToNewAdmin />} />

                {/* 3PT 슛 대회 심층 페이지 (직링크 보존) */}
                <Route path="/tournament/manage/:id" element={<TournamentManage />} />
                <Route path="/tournament/shoot/:playerId" element={<TournamentShootPage />} />

                {/* 3:3 라이브 전광판 */}
                <Route path="/threevthree" element={<ThreeVThreeScoreboard />} />
                <Route path="/3v3/scoreboard" element={<ThreeVThreeScoreboard />} />

                {/* 3:3 대회 관리 Admin */}
                <Route path="/threevthree/admin" element={<ThreeVThreeAdmin />} />
                <Route path="/3v3/admin" element={<ThreeVThreeAdmin />} />
                <Route path="/tournament/manage-3v3/:id" element={<ThreeVThreeAdmin />} />

            </Routes>
            <PlayZoneFAB />
        </Router>
    );
}
