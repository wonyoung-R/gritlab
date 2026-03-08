import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import ShootoutDashboard from './pages/shootout/Dashboard';
import ShootoutGame from './pages/shootout/Shoot';
import AdminLogin from './pages/tournament/AdminLogin';
import TournamentDashboard from './pages/tournament/Dashboard';
import TournamentManage from './pages/tournament/Manage';
import TournamentShootPage from './pages/tournament/Shoot';
import TournamentLeaderboard from './pages/tournament/Leaderboard';
import PlayZoneFAB from './components/PlayZoneFAB';

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

                {/* 정식 대회용 클라우드 버전 */}
                <Route path="/tournament/admin" element={<AdminLogin />} />
                <Route path="/tournament/dashboard" element={<TournamentDashboard />} />
                <Route path="/tournament/manage/:id" element={<TournamentManage />} />
                <Route path="/tournament/shoot/:playerId" element={<TournamentShootPage />} />

                {/* 임시 3v3 매니저 라우터 */}
                <Route path="/tournament/manage-3v3/:id" element={<div className="text-white text-center p-20">3:3 대회 관리 전광판 준비중...</div>} />

            </Routes>
            <PlayZoneFAB />
        </Router>
    );
}
