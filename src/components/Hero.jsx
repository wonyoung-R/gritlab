import { useRef } from 'react'
import { asset } from '../utils'
import { motion, useScroll, useTransform } from 'framer-motion'

const NAVER_RESERVATION_URL = 'https://m.place.naver.com/place/2000567383/home?fbclid=PAVERFWAQWgBRleHRuA2FlbQIxMQBzcnRjBmFwcF9pZA8xMjQwMjQ1NzQyODc0MTQAAafIHHcl87dVwQuilCfNvyWJsEYSEOTCnUpGlMMc_sPuZYblnNo6CwihC974Pg_aem_XkDQvDpwu6jDwonjTX6kxw'

export default function Hero() {
  const containerRef = useRef(null)
  const { scrollY } = useScroll()
  const bgY = useTransform(scrollY, [0, 700], [0, 160])
  const opacity = useTransform(scrollY, [0, 500], [1, 0])

  return (
    <section
      id="hero"
      ref={containerRef}
      className="relative w-full h-screen min-h-[600px] overflow-hidden"
    >
      {/* Background with parallax */}
      <motion.div
        style={{ y: bgY }}
        className="absolute inset-0 w-full h-[115%] -top-[7.5%]"
      >
        <img
          src={asset('/images/IMG_7256.webp')}
          alt="GRIT LAB"
          className="w-full h-full object-cover"
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080F1E] via-[#080F1E]/30 to-[#080F1E]/50" />
      </motion.div>

      {/* Content — bottom layout like AC3 */}
      <motion.div
        style={{ opacity }}
        className="absolute inset-0 flex flex-col justify-end px-6 md:px-10 pb-12 md:pb-16"
      >
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8">
          {/* Left — Main headline + CTA */}
          <div>
            {/* Pre-label */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-[11px] text-white/40 tracking-[0.35em] uppercase mb-4"
            >
              Basketball Court · 경기도 화성시 동탄
            </motion.p>

            {/* Giant headline */}
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="font-anton leading-[0.9] tracking-[0.04em] text-white"
              style={{ fontSize: 'clamp(5rem, 16vw, 18rem)' }}
            >
              GRIT LAB
            </motion.h1>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.9 }}
              className="mt-6"
            >
              <a
                href={NAVER_RESERVATION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-7 py-3.5 border border-white/30 hover:border-white text-white text-[11px] tracking-[0.3em] uppercase rounded-full transition-all duration-500 hover:bg-white hover:text-[#080F1E] group"
              >
                코트 대관 예약
                <span className="transition-transform duration-300 group-hover:translate-x-1">↗</span>
              </a>
            </motion.div>
          </div>

          {/* Right — Slogan + description */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="md:text-right md:max-w-xs"
          >
            <p className="font-anton text-4xl md:text-5xl tracking-[0.08em] text-white/90 mb-3">
              SLOW<br />GRIND
            </p>
            <p className="text-[12px] text-white/40 leading-relaxed tracking-wide">
              꾸준히, 묵묵히.<br />
              당신만의 코트에서 시작하세요.
            </p>
          </motion.div>
        </div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="w-px h-10 bg-gradient-to-b from-white/20 to-transparent"
          />
        </motion.div>
      </motion.div>
    </section>
  )
}
