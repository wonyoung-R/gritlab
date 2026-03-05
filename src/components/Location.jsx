import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

const ADDRESS = '경기도 화성시 동탄 470-20'
const KAKAO_MAP_URL = `https://map.kakao.com/link/search/${encodeURIComponent(ADDRESS)}`
const NAVER_MAP_URL = `https://map.naver.com/v5/search/${encodeURIComponent(ADDRESS)}`

export default function Location() {
  const titleRef = useRef(null)
  const titleInView = useInView(titleRef, { once: true, margin: '-80px' })

  return (
    <section id="location" className="py-24 md:py-36 border-t border-white/8">
      {/* Header */}
      <div ref={titleRef} className="px-6 md:px-10 mb-14 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={titleInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <p className="text-[11px] text-white/30 tracking-[0.35em] uppercase mb-3">Location</p>
          <h2
            className="font-anton text-white leading-none tracking-[0.04em]"
            style={{ fontSize: 'clamp(3rem, 8vw, 8rem)' }}
          >
            오시는 길
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={titleInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="flex gap-3"
        >
          <a
            href={KAKAO_MAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 border border-white/20 hover:border-white/50 text-white text-[11px] tracking-[0.25em] uppercase rounded-full transition-all duration-300 hover:bg-white/5"
          >
            카카오맵 ↗
          </a>
          <a
            href={NAVER_MAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 border border-white/20 hover:border-white/50 text-white text-[11px] tracking-[0.25em] uppercase rounded-full transition-all duration-300 hover:bg-white/5"
          >
            네이버지도 ↗
          </a>
        </motion.div>
      </div>

      {/* Map — full bleed */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 1 }}
        className="w-full h-[400px] md:h-[520px] relative overflow-hidden"
      >
        <iframe
          title="GRIT LAB 위치"
          src={`https://maps.google.com/maps?q=${encodeURIComponent(ADDRESS)}&output=embed&hl=ko`}
          className="w-full h-full border-0"
          style={{ filter: 'invert(92%) hue-rotate(180deg) saturate(0.7) brightness(0.85)' }}
          allowFullScreen
          loading="lazy"
        />
        {/* Side fade */}
        <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#080F1E] to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#080F1E] to-transparent pointer-events-none" />
      </motion.div>

      {/* Address row */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="px-6 md:px-10 mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <p className="text-[13px] text-white/40 tracking-wide">{ADDRESS}</p>
        <p className="text-[13px] text-white/40 tracking-wide">24시간 연중무휴</p>
      </motion.div>
    </section>
  )
}
