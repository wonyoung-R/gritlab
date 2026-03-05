import { motion } from 'framer-motion'

export default function Marquee({ text = 'SLOW GRIND', repeat = 8, inverted = false }) {
  const items = Array(repeat).fill(text)

  return (
    <div className={`overflow-hidden py-5 border-y ${inverted ? 'border-white/10 bg-white' : 'border-white/8 bg-transparent'}`}>
      <motion.div
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        className="flex whitespace-nowrap"
      >
        {[...items, ...items].map((item, i) => (
          <span
            key={i}
            className={`font-anton text-[13px] tracking-[0.4em] uppercase mx-8 ${
              inverted ? 'text-[#080F1E]' : 'text-white/15'
            }`}
          >
            {item}
            <span className={`mx-8 ${inverted ? 'text-[#080F1E]/30' : 'text-white/8'}`}>—</span>
          </span>
        ))}
      </motion.div>
    </div>
  )
}
