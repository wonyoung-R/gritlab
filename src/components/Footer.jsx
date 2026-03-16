import { useNavigate } from 'react-router-dom'

const INSTAGRAM_URL = 'https://www.instagram.com/grit_lab_basketball?igsh=YmdybXcxcnRsb2I='
const NAVER_RESERVATION_URL = 'https://m.place.naver.com/place/2000567383/home?fbclid=PAVERFWAQWgBRleHRuA2FlbQIxMQBzcnRjBmFwcF9pZA8xMjQwMjQ1NzQyODc0MTQAAafIHHcl87dVwQuilCfNvyWJsEYSEOTCnUpGlMMc_sPuZYblnNo6CwihC974Pg_aem_XkDQvDpwu6jDwonjTX6kxw'

export default function Footer() {
  const navigate = useNavigate()
  return (
    <footer className="border-t border-white/8">
      {/* Footer bottom */}
      <div className="px-6 md:px-10 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        {/* Logo + address */}
        <div>
          <span className="font-anton text-xl tracking-[0.15em] text-white">GRIT LAB</span>
          <p className="text-[11px] text-white/25 mt-1 tracking-wide">경기도 화성시 경기동로 470-20</p>
        </div>

        {/* Center — links */}
        <div className="flex items-center gap-8">
          <a href="#gallery" className="text-[11px] text-white/30 hover:text-white tracking-[0.25em] uppercase transition-colors">Facility</a>
          <a href="#pricing" className="text-[11px] text-white/30 hover:text-white tracking-[0.25em] uppercase transition-colors">Pricing</a>
          <a href="#location" className="text-[11px] text-white/30 hover:text-white tracking-[0.25em] uppercase transition-colors">Location</a>
        </div>

        {/* Right — SNS */}
        <div className="flex items-center gap-5">
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-white/30 hover:text-white tracking-[0.25em] uppercase transition-colors"
          >
            Instagram ↗
          </a>
          <a
            href={NAVER_RESERVATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-white/30 hover:text-white tracking-[0.25em] uppercase transition-colors"
          >
            네이버예약 ↗
          </a>
          <button
            onClick={() => navigate('/tournament/admin')}
            className="text-[11px] text-white/15 hover:text-white/40 tracking-[0.25em] uppercase transition-colors"
          >
            Grit Admin
          </button>
        </div>
      </div>

      <div className="px-6 md:px-10 pb-6">
        <p className="text-[10px] text-white/15 tracking-wider">© {new Date().getFullYear()} GRIT LAB. All rights reserved.</p>
      </div>
    </footer>
  )
}
