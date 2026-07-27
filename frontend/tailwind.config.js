/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        indigo: {
          550: '#535bf2',
          650: '#4338ca',
          750: '#312e81',
        },
      },
    },
  },
  plugins: [],
}
