import { useRef, useEffect, useState } from 'react'
import { asset } from '../utils'
import { motion, useInView } from 'framer-motion'

const VIDEOS = [
  {
    src: asset('/videos/gritlab1.MP4'),
    poster: asset('/images/IMG_7257.webp'),
    label: '01',
    title: 'GRIT LAB 코트',
    desc: '경기도 화성시 동탄의 프리미엄 농구 코트',
  },
  {
    src: asset('/videos/gritlab2.MP4'),
    poster: asset('/images/IMG_7260.webp'),
    label: '02',
    title: 'SLOW GRIND',
    desc: '꾸준한 훈련이 만드는 차이',
  },
]

function VideoCard({ video, index }) {
  const wrapperRef = useRef(null)
  const videoRef = useRef(null)
  const inView = useInView(wrapperRef, { once: false, margin: '-10%' })
  const animInView = useInView(wrapperRef, { once: true, margin: '-60px' })
  const [soundOn, setSoundOn] = useState(false)

  // React muted 속성 버그 수정 — ref로 직접 설정
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = true
    v.defaultMuted = true
  }, [])

  // 스크롤 진입 자동재생 / 벗어나면 정지
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (inView) {
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [inView])

  const toggleSound = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = soundOn
    setSoundOn(!soundOn)
  }

  return (
    <motion.div
      ref={wrapperRef}
      initial={{ opacity: 0, y: 50 }}
      animate={animInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 1, delay: index * 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="relative overflow-hidden aspect-[9/16] bg-[#0D1B2A] group">
        <video
          ref={videoRef}
          loop
          playsInline
          preload="metadata"
          poster={video.poster}
          className="w-full h-full object-cover"
        >
          <source src={video.src} type="video/mp4" />
        </video>

        {/* 사운드 토글 */}
        <button
          onClick={toggleSound}
          className="absolute bottom-4 right-4 z-10 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 hover:border-white/50 flex items-center justify-center transition-all duration-300"
          aria-label={soundOn ? '소리 끄기' : '소리 켜기'}
        >
          {soundOn ? (
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white/60" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3z"/>
            </svg>
          )}
        </button>

        <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/20 scale-x-0 group-hover:scale-x-100 transition-transform duration-700 origin-left" />
      </div>

      <div className="flex items-start justify-between gap-4 mt-5">
        <div>
          <span className="text-[11px] text-white/25 tracking-[0.3em] uppercase">{video.label}</span>
          <h3 className="font-anton text-2xl md:text-3xl tracking-[0.06em] text-white mt-1">{video.title}</h3>
        </div>
        <p className="text-[12px] text-white/35 leading-relaxed text-right max-w-[160px] mt-1">{video.desc}</p>
      </div>
    </motion.div>
  )
}

export default function Videos() {
  const titleRef = useRef(null)
  const titleInView = useInView(titleRef, { once: true, margin: '-80px' })

  return (
    <section id="videos" className="py-24 md:py-36 px-6 md:px-10">
      <div ref={titleRef} className="mb-14 flex items-end justify-between">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={titleInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <p className="text-[11px] text-white/30 tracking-[0.35em] uppercase mb-3">Videos</p>
          <h2
            className="font-anton text-white leading-none tracking-[0.04em]"
            style={{ fontSize: 'clamp(3rem, 8vw, 8rem)' }}
          >
            영상
          </h2>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto md:mx-0 items-start">
        {VIDEOS.map((video, i) => (
          <VideoCard key={video.label} video={video} index={i} />
        ))}

        {/* 3번째 — 인스타그램 핀 */}
        <motion.a
          href="https://www.instagram.com/airballfactory?igsh=MWl0eXEwNDI4aWNnYg=="
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 1, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="group flex flex-col items-start"
        >
          <div className="w-full aspect-[9/16] border border-white/10 group-hover:border-white/30 flex flex-col items-center justify-center gap-5 transition-all duration-500 bg-white/[0.02] group-hover:bg-white/[0.04] relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
            <span className="text-5xl select-none">📍</span>
            <div className="text-center px-6">
              <p className="font-anton text-xl tracking-[0.1em] text-white mb-2">airballfactory</p>
              <p className="text-[11px] text-white/30 tracking-[0.2em] uppercase">Instagram</p>
            </div>
            <span className="text-white/20 group-hover:text-white/60 text-2xl transition-all duration-300 group-hover:-translate-y-1 group-hover:translate-x-1">↗</span>
          </div>
          <div className="flex items-start justify-between gap-4 mt-5 w-full">
            <div>
              <span className="text-[11px] text-white/25 tracking-[0.3em] uppercase">03</span>
              <h3 className="font-anton text-2xl md:text-3xl tracking-[0.06em] text-white mt-1">airballfactory</h3>
            </div>
            <p className="text-[12px] text-white/35 leading-relaxed text-right mt-1">Instagram ↗</p>
          </div>
        </motion.a>
      </div>
    </section>
  )
}
