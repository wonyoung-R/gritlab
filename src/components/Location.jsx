import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

const ADDRESS = '경기동로 470-20'
const KAKAO_MAP_URL = `https://map.kakao.com/link/search/${encodeURIComponent(ADDRESS)}`
const NAVER_MAP_URL = `https://map.naver.com/v5/search/${encodeURIComponent(ADDRESS)}`
const TMAP_URL = `tmap://search?name=${encodeURIComponent('GRIT LAB ' + ADDRESS)}`

export default function Location() {
  const titleRef = useRef(null)
  const titleInView = useInView(titleRef, { once: true, margin: '-80px' })

  return (
    <section id="location" className="py-24 md:py-36 border-t border-white/8 relative overflow-hidden">
      {/* Background glow to make it distinct */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/[0.02] rounded-full blur-[100px] pointer-events-none" />

      {/* Header & Content */}
      <div ref={titleRef} className="px-6 md:px-10 flex flex-col items-start gap-6 relative z-10 w-full">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={titleInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-left"
        >
          <p className="text-[16px] text-white/30 tracking-[0.35em] uppercase mb-3">Location</p>

          <p className="text-xl md:text-2xl text-white/80 tracking-widest font-light mb-3 break-keep">
            {ADDRESS}
          </p>
          <p className="text-sm text-white/40 tracking-wider mb-14">
            24시간 연중무휴
          </p>
        </motion.div>

        {/* Navigation Buttons Container */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={titleInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="flex flex-col sm:flex-row gap-4 w-full"
        >
          {/* Naver Map */}
          <a
            href={NAVER_MAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-4 py-8 border border-[#03C75A]/40 bg-[#03C75A]/5 hover:bg-[#03C75A] hover:border-[#03C75A] hover:-translate-y-1 group rounded-2xl transition-all duration-300 flex flex-col items-center justify-center gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:shadow-[0_10px_30px_rgba(3,199,90,0.3)]"
          >
            <span className="text-white group-hover:text-white font-bold text-lg md:text-xl tracking-widest transition-colors">네이버 지도</span>
            <span className="text-[#03C75A] group-hover:text-white/80 text-[11px] tracking-wider uppercase transition-colors">Route Info ↗</span>
          </a>

          {/* Kakao Map */}
          <a
            href={KAKAO_MAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-4 py-8 border border-[#FAE100]/40 bg-[#FAE100]/5 hover:bg-[#FAE100] hover:border-[#FAE100] hover:-translate-y-1 group rounded-2xl transition-all duration-300 flex flex-col items-center justify-center gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:shadow-[0_10px_30px_rgba(250,225,0,0.2)]"
          >
            <span className="text-white group-hover:text-[#191919] font-bold text-lg md:text-xl tracking-widest transition-colors">카카오맵</span>
            <span className="text-[#FAE100] group-hover:text-[#191919]/70 text-[11px] tracking-wider uppercase transition-colors">Route Info ↗</span>
          </a>

          {/* TMAP */}
          <a
            href={TMAP_URL}
            className="flex-1 px-4 py-8 border border-white/20 bg-white/5 hover:bg-white hover:border-white hover:-translate-y-1 group rounded-2xl transition-all duration-300 flex flex-col items-center justify-center gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:shadow-[0_10px_30px_rgba(255,255,255,0.2)]"
          >
            <span className="text-white group-hover:text-[#080F1E] font-extrabold text-lg md:text-xl tracking-widest transition-colors">TMAP</span>
            <span className="text-white/50 group-hover:text-[#080F1E]/70 text-[11px] tracking-wider uppercase transition-colors">App Open ↗</span>
          </a>
        </motion.div>
      </div>
    </section>
  )
}

