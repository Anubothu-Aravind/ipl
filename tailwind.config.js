/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b111d",
        sky: "#0ea5e9",
        mint: "#34d399",
      },
      boxShadow: {
        panel: "0 20px 60px rgba(2, 6, 23, 0.35)",
      },
    },
  },
  plugins: [],
};
