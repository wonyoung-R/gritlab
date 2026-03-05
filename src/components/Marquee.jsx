export default function Marquee({ text = 'SLOW GRIND', repeat = 8 }) {
  const items = Array(repeat * 2).fill(text)

  return (
    <div className="overflow-hidden py-5 border-y border-white/8">
      <div className="flex whitespace-nowrap" style={{ animation: 'marquee 24s linear infinite' }}>
        {items.map((item, i) => (
          <span key={i} className="font-anton text-[13px] tracking-[0.4em] uppercase mx-8 text-white/15">
            {item}
            <span className="mx-8 text-white/8">—</span>
          </span>
        ))}
      </div>
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
