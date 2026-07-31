/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#10161d",
        plate: "#1a232d",
        plate2: "#212c38",
        blueprint: "#2c3e50",
        line: "#324454",
        rivet: "#d68a3c",
        rivet2: "#f0a94e",
        paper: "#eef1f4",
        muted: "#8fa1b0",
        ok: "#4f9d69",
        warn: "#c2542f",
      },
      fontFamily: {
        display: ["'Sora'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      backgroundImage: {
        blueprint:
          "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "28px 28px",
      },
    },
  },
  plugins: [],
};
