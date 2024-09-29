/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx,css,scss,sass}",
  ],
  theme: {
    extend: {
      fontFamily:{
        satoshi:["Satoshi","sans-serif"],
        inter: ["Inter", "sans-serif"],
      }
    },
  },
  plugins: [],
}