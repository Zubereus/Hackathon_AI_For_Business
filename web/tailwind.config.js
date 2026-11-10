/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#090D16',
          card: '#111827',
          surface: '#151E32',
          border: '#1F293D',
        },
      },
    },
  },
  plugins: [],
};
