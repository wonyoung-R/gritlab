import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

const NAVER_RESERVATION_URL = 'https://m.place.naver.com/place/2000567383/home?fbclid=PAVERFWAQWgBRleHRuA2FlbQIxMQBzcnRjBmFwcF9pZA8xMjQwMjQ1NzQyODc0MTQAAafIHHcl87dVwQuilCfNvyWJsEYSEOTCnUpGlMMc_sPuZYblnNo6CwihC974Pg_aem_XkDQvDpwu6jDwonjTX6kxw'

const TIERS = [
  {
    index: '01',
    time: '00:00 – 09:00',
    label: '심야 / 새벽',
    price: '12,000',
    unit: '원 / 30분',
    note: '인원 제한 없음 · 단독 전체 코트',
  },
  {
    index: '02',
    time: '09:00 – 24:00',
    label: '주간 / 야간',
    price: '14,000',
    unit: '원 / 30분',
    note: '인원 제한 없음 · 단독 전체 코트',
  },
]

const FEATURES = [
  { icon: '▸', text: 'FIBA 정식 규격 코트' },
  { icon: '▸', text: 'NBA 3점 라인' },
  { icon: '▸', text: '나무 바닥' },
  { icon: '▸', text: '높이 조절 골대' },
  { icon: '▸', text: '윌슨 & 몰텐공 6호 / 7호' },
  { icon: '▸', text: '실내 화장실' },
]

export default function Pricing() {
  const titleRef = useRef(null)
  const titleInView = useInView(titleRef, { once: true, margin: '-80px' })

  return (
    <section id="pricing" className="py-24 md:py-36 px-6 md:px-10 border-t border-white/8">
      {/* Header */}
      <div ref={titleRef} className="mb-16 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={titleInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <p className="text-[16px] text-white/30 tracking-[0.35em] uppercase mb-3">Pricing</p>

          <p className="text-[12px] text-white/30 mt-3 tracking-wide">
            단독 전체 코트 대관 · 30분 단위 · 인원 제한 없음
          </p>
        </motion.div>

        <motion.a
          initial={{ opacity: 0 }}
          animate={titleInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.4 }}
          href={NAVER_RESERVATION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 px-8 py-4 border-2 border-[#03C75A] text-[#03C75A] bg-[#03C75A]/10 hover:bg-[#03C75A] hover:text-white text-[12px] tracking-[0.3em] font-bold uppercase rounded-full transition-all duration-500 hover:shadow-[0_0_25px_rgba(3,199,90,0.5)] group self-start md:self-auto"
        >
          네이버 예약하기
          <span className="transition-transform duration-300 group-hover:translate-x-1">↗</span>
        </motion.a>
      </div>

      {/* Pricing rows */}
      <div className="border-t border-white/8 mb-16">
        {TIERS.map((tier, i) => (
          <motion.div
            key={tier.index}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.7, delay: i * 0.1 }}
            className="group flex flex-col sm:flex-row sm:items-center justify-between py-8 border-b border-white/8 hover:bg-white/[0.02] px-2 -mx-2 transition-colors duration-300 gap-3"
          >
            {/* Left — index + time + label */}
            <div className="flex items-center gap-6">
              <span className="text-[11px] text-white/20 tracking-[0.3em] w-6 shrink-0">{tier.index}</span>
              <div>
                <p className="text-[11px] text-white/30 tracking-[0.2em] uppercase mb-0.5">{tier.time}</p>
                <p className="font-anton text-2xl md:text-3xl tracking-[0.05em] text-white">{tier.label}</p>
              </div>
            </div>

            {/* Center — note */}
            <p className="text-[11px] text-white/25 tracking-wide pl-12 sm:pl-0">{tier.note}</p>

            {/* Right — price */}
            <div className="flex items-baseline gap-2 pl-12 sm:pl-0 shrink-0">
              <span className="font-anton text-3xl md:text-4xl tracking-[0.04em] text-white">{tier.price}</span>
              <span className="text-[11px] text-white/30">{tier.unit}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Facility features */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <p className="text-[11px] text-white/25 tracking-[0.35em] uppercase mb-6">시설 포함</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.text}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              className="border-l border-white/10 pl-4 py-1"
            >
              <span className="text-[11px] text-white/35 leading-relaxed tracking-wide">{f.text}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}
