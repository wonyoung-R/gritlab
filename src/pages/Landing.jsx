import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import Marquee from '../components/Marquee'
import Gallery from '../components/Gallery'
import Videos from '../components/Videos'
import Pricing from '../components/Pricing'
import Location from '../components/Location'
import Footer from '../components/Footer'

export default function Landing() {
  return (
    <div className="bg-[#080F1E] min-h-screen">
      <Navbar />
      <Hero />
      <Marquee text="SLOW GRIND · GRIT LAB · BASKETBALL COURT · 동탄" repeat={6} />
      <Gallery />
      <Videos />
      <Marquee text="COURT RENTAL · 시간당 15,000원 · 경기도 화성시 · GRIT LAB" repeat={6} />
      <Pricing />
      <Location />
      <Footer />
    </div>
  )
}
