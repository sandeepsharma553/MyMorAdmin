/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js}"],
  theme: {
    extend: {screens: {
      hd:    "1440px",  // 1440×900
      wsxga: "1680px",  // 1680×1050
      wuxga: "1920px",  // 1920×1200
    },},
  },
  plugins: [],
};
