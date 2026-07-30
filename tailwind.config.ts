import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        panel: "#14171A",
        "panel-alt": "#1B1F23",
        "panel-row": "#191C1F",
        "panel-row-alt": "#1E2226",
        ink: "#F3F5F7",
        "ink-dim": "#9CA6AF",
        amber: "#FFB020",
        signal: {
          green: "#33E27A",
          blue: "#3AA6FF",
          red: "#FF4D4D",
        },
        pastel: {
          green: "#CFF5DC",
          red: "#F8D6D6",
        },
        "electric-blue": "#1463FF",
        "soft-blue": "#8FC6FF",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        data: ["var(--font-data)"],
      },
    },
  },
  plugins: [],
};
export default config;
