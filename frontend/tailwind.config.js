/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172b4d",
        muted: "#8290a6",
        canvas: "#f5f8fc",
        brand: "#377dff",
        mint: "#29b99a",
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 6px 26px rgba(28, 54, 94, .055)" },
    },
  },
  plugins: [],
};
