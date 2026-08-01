import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        sprout: { DEFAULT: "#17A45E", light: "#4ED28C" },
        deep: "#123528",
        zest: "#FFC43D",
        mist: "#E9F6EE",
        paper: "#FCFCFA",
        line: "#E7E5DD",
        muted: { DEFAULT: "#82806F", nav: "#A6A395" },
        surfacedark: "#0E2620",
      },
      fontFamily: {
        sans: ["Gabarito", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
        sheet: "18px",
        tile: "24px",
      },
    },
  },
  plugins: [],
};
export default config;
