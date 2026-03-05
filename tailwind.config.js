/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#040810',
          900: '#080F1E',
          800: '#0D1B2A',
          700: '#0F2347',
          600: '#1A3A6B',
          500: '#1E4D8C',
        },
        gold: {
          400: '#F0C060',
          500: '#D4A843',
          600: '#B8922A',
        },
      },
      fontFamily: {
        anton: ['Anton', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
