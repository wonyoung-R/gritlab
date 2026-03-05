import { motion } from 'framer-motion'

const INSTAGRAM_URL = 'https://www.instagram.com/grit_lab_basketball?igsh=YmdybXcxcnRsb2I='
const NAVER_RESERVATION_URL = 'https://m.place.naver.com/place/2000567383/home?fbclid=PAVERFWAQWgBRleHRuA2FlbQIxMQBzcnRjBmFwcF9pZA8xMjQwMjQ1NzQyODc0MTQAAafIHHcl87dVwQuilCfNvyWJsEYSEOTCnUpGlMMc_sPuZYblnNo6CwihC974Pg_aem_XkDQvDpwu6jDwonjTX6kxw'

export default function Footer() {
  return (
    <footer className="border-t border-white/8">
      {/* Big CTA — AC3 style "Drop us a line" */}
      <a
        href={NAVER_RESERVATION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group block px-6 md:px-10 py-16 md:py-24 border-b border-white/8 hover:bg-white/[0.02] transition-colors duration-500"
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-4"
        >
          <div>
            <p className="text-[11px] text-white/30 tracking-[0.35em] uppercase mb-4">
              예약 문의
            </p>
            <h2
              className="font-anton text-white leading-none tracking-[0.04em] group-hover:text-white/80 transition-colors duration-300"
              style={{ fontSize: 'clamp(3rem, 10vw, 10rem)' }}
            >
              코트 예약하기.
            </h2>
          </div>
          <span className="text-4xl md:text-6xl text-white/20 group-hover:text-white/50 group-hover:translate-x-2 group-hover:-translate-y-2 transition-all duration-500">
            ↗
          </span>
        </motion.div>
      </a>

      {/* Footer bottom */}
      <div className="px-6 md:px-10 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        {/* Logo + address */}
        <div>
          <span className="font-anton text-xl tracking-[0.15em] text-white">GRIT LAB</span>
          <p className="text-[11px] text-white/25 mt-1 tracking-wide">경기도 화성시 동탄 470-20</p>
        </div>

        {/* Center — links */}
        <div className="flex items-center gap-8">
          <a href="#gallery" className="text-[11px] text-white/30 hover:text-white tracking-[0.25em] uppercase transition-colors">Gallery</a>
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
        </div>
      </div>

      <div className="px-6 md:px-10 pb-6">
        <p className="text-[10px] text-white/15 tracking-wider">© {new Date().getFullYear()} GRIT LAB. All rights reserved.</p>
      </div>
    </footer>
  )
}
