import { useRef } from 'react'
import { motion, useInView, useScroll, useTransform } from 'framer-motion'

const PHOTOS = [
  { src: '/images/IMG_7257.JPG', alt: '메인 코트', size: 'large' },
  { src: '/images/IMG_7258.JPG', alt: '코트 전경', size: 'small' },
  { src: '/images/IMG_7259.JPG', alt: '골대', size: 'small' },
  { src: '/images/IMG_7260.JPG', alt: '3점 라인', size: 'large' },
  { src: '/images/IMG_7261.JPG', alt: '사이드라인', size: 'small' },
  { src: '/images/IMG_7262.JPG', alt: '시설 내부', size: 'small' },
  { src: '/images/IMG_7263.JPG', alt: '대기 공간', size: 'large' },
]

function ParallaxImage({ photo, index }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-10%' })
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [40, -40])

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 1, delay: (index % 2) * 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`relative overflow-hidden group ${
        photo.size === 'large'
          ? 'col-span-2 aspect-[16/9]'
          : 'col-span-1 aspect-[4/5]'
      }`}
    >
      <motion.img
        style={{ y }}
        src={photo.src}
        alt={photo.alt}
        className="w-full h-[110%] object-cover -mt-[5%] transition-transform duration-700 group-hover:scale-105"
      />
      {/* Subtle hover overlay */}
      <div className="absolute inset-0 bg-[#080F1E]/0 group-hover:bg-[#080F1E]/20 transition-colors duration-500" />
      {/* Caption */}
      <div className="absolute bottom-0 left-0 right-0 p-5 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-400">
        <span className="text-[11px] text-white tracking-[0.3em] uppercase">{photo.alt}</span>
      </div>
    </motion.div>
  )
}

export default function Gallery() {
  const titleRef = useRef(null)
  const titleInView = useInView(titleRef, { once: true, margin: '-80px' })

  return (
    <section id="gallery" className="py-24 md:py-36">
      {/* Section label */}
      <div ref={titleRef} className="px-6 md:px-10 mb-12 flex items-end justify-between">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={titleInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <p className="text-[11px] text-white/30 tracking-[0.35em] uppercase mb-3">Facility</p>
          <h2
            className="font-anton text-white leading-none tracking-[0.04em]"
            style={{ fontSize: 'clamp(3rem, 8vw, 8rem)' }}
          >
            시설 갤러리
          </h2>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={titleInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="hidden md:block text-[12px] text-white/30 max-w-[200px] text-right leading-relaxed"
        >
          최상의 환경에서<br />더 나은 경기를 경험하세요.
        </motion.p>
      </div>

      {/* Full-width photo grid */}
      <div className="px-6 md:px-10 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {PHOTOS.map((photo, i) => (
          <ParallaxImage key={photo.src} photo={photo} index={i} />
        ))}
      </div>
    </section>
  )
}
