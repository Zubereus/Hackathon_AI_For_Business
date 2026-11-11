/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: token('paper'),
        surface: token('surface'),
        sunken: token('sunken'),
        ink: token('ink'),
        muted: token('muted'),
        rule: token('rule'),
        'rule-strong': token('rule-strong'),
        accent: token('accent'),
        'accent-ink': token('accent-ink'),
        good: token('good'),
        'good-bg': token('good-bg'),
        bad: token('bad'),
        'bad-bg': token('bad-bg'),
        warn: token('warn'),
        'warn-bg': token('warn-bg'),
      },
      fontFamily: {
        sans: ['"Source Sans 3"', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
