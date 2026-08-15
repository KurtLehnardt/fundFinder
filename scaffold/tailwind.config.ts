import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBFAF7",
        ink: "#12161C",
        slate: { 550: "#5A6572" },
        federal: "#1B3A6B",
        rule: "#DDD8CE",
        fit: { strong: "#1E7A4C", verify: "#B4801A", adjacent: "#C25A2B", none: "#6B7280" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: { eyebrow: "0.14em" },
    },
  },
  plugins: [],
} satisfies Config;
