module.exports = {
  content: [
    './index.html',
    './app.js',
    './i18n.js',
    './privacy-policy.html',
    './terms.html',
    './ads-tool.html',
    './tours/**/*.html',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'hsl(214 100% 97%)',
          100: 'hsl(214 95% 93%)',
          200: 'hsl(213 97% 87%)',
          300: 'hsl(212 96% 78%)',
          400: 'hsl(213 94% 68%)',
          500: 'hsl(217 91% 60%)',
          600: 'hsl(221 83% 53%)',
          700: 'hsl(224 76% 48%)',
          800: 'hsl(214 100% 32%)',
          900: 'hsl(222 47% 11%)',
        },
        ink: 'hsl(222 47% 11%)',
        muted: 'hsl(215 16% 47%)',
        border: 'hsl(214 32% 91%)',
        surface: 'hsl(210 40% 96%)',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / .05), 0 1px 3px 0 rgb(0 0 0 / .06)',
        cta: '0 12px 30px -10px hsl(221 83% 53% / .45)',
      },
    },
  },
};
