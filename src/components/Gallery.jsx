import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { asset } from '../utils'

const PHOTOS = [
  { src: asset('/images/IMG_7257.webp'), alt: '메인 코트', size: 'large' },
  { src: asset('/images/IMG_7258.webp'), alt: '코트 전경', size: 'small' },
  { src: asset('/images/IMG_7259.webp'), alt: '체육관 입구', size: 'small' },
  { src: asset('/images/IMG_7260.webp'), alt: '3점 라인', size: 'large' },
  { src: asset('/images/IMG_7261.webp'), alt: '공용시설', size: 'small' },
  { src: asset('/images/IMG_7262.webp'), alt: '공용 시설', size: 'small' },
  { src: asset('/images/IMG_7263.webp'), alt: '대기공간 및 체육관전경', size: 'large' },
]

function PhotoCard({ photo, index }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-8%' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.9, delay: (index % 3) * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`relative overflow-hidden group bg-[#0D1B2A] ${
        photo.size === 'large' ? 'col-span-2 aspect-[16/9]' : 'col-span-1 aspect-[4/5]'
      }`}
    >
      <img
        src={photo.src}
        alt={photo.alt}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-[#080F1E]/0 group-hover:bg-[#080F1E]/25 transition-colors duration-500" />
      <div className="absolute bottom-0 left-0 right-0 p-5 translate-y-3 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-400">
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

      <div className="px-6 md:px-10 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {PHOTOS.map((photo, i) => (
          <PhotoCard key={photo.src} photo={photo} index={i} />
        ))}
      </div>
    </section>
  )
}
