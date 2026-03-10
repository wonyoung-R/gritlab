import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const NAVER_RESERVATION_URL = 'https://m.place.naver.com/place/2000567383/home?fbclid=PAVERFWAQWgBRleHRuA2FlbQIxMQBzcnRjBmFwcF9pZA8xMjQwMjQ1NzQyODc0MTQAAafIHHcl87dVwQuilCfNvyWJsEYSEOTCnUpGlMMc_sPuZYblnNo6CwihC974Pg_aem_XkDQvDpwu6jDwonjTX6kxw'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navLinks = [
    { label: 'Gallery', href: '#gallery' },
    { label: 'Videos', href: '#videos' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Location', href: '#location' },
    { label: 'Records', href: '/records' },
  ]

  return (
    <motion.nav
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, delay: 0.5 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 ${scrolled ? 'bg-[#080F1E]/80 backdrop-blur-md' : 'bg-transparent'
        }`}
    >
      <div className="px-6 md:px-10 flex items-center justify-between h-14 md:h-16">
        {/* Logo */}
        <a href="#hero" className="font-anton text-xl md:text-2xl tracking-[0.2em] text-white">
          GRIT LAB
        </a>

        {/* Desktop nav — centered */}
        <div className="hidden md:flex items-center gap-10">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[11px] text-white/50 hover:text-white tracking-[0.25em] uppercase transition-colors duration-300"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Right — reservation */}
        <div className="hidden md:block">
          <a
            href={NAVER_RESERVATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 border border-[#03C75A] text-[#03C75A] hover:bg-[#03C75A] hover:text-white text-[11px] tracking-[0.25em] font-bold uppercase rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(3,199,90,0.1)] hover:shadow-[0_0_20px_rgba(3,199,90,0.4)]"
          >
            네이버 예약하기 ↗
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex flex-col gap-[5px] p-2"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="메뉴"
        >
          <span className={`block w-5 h-px bg-white transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-[6px]' : ''}`} />
          <span className={`block w-5 h-px bg-white transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-px bg-white transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-[6px]' : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="md:hidden bg-[#080F1E]/95 backdrop-blur-md px-6 pb-6 pt-2"
          >
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block py-3 text-[11px] text-white/50 hover:text-white tracking-[0.25em] uppercase border-b border-white/5 transition-colors"
              >
                {link.label}
              </a>
            ))}
            <a
              href={NAVER_RESERVATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-4 py-3 px-4 border border-[#03C75A] text-[#03C75A] hover:bg-[#03C75A] hover:text-white text-[12px] font-bold text-center tracking-[0.25em] uppercase transition-all duration-300 rounded-lg shadow-[0_0_10px_rgba(3,199,90,0.1)]"
            >
              네이버 예약하기 ↗
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}
