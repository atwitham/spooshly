import type { Config } from "tailwindcss";

// Tokens from the redesign handoff §3.1. Values live in globals.css as CSS
// variables; Tailwind just points at them.
const v = (name: string) => `var(--${name})`;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        ink: v("ink"),
        muted: v("muted"),
        line: v("line"),
        divider: v("divider"),
        soft: v("soft"),
        chip: v("chip"),
        track: "#E9EEE7",
        primary: { DEFAULT: v("primary"), press: v("primary-press"), tint: v("primary-tint"), "tint-ink": v("primary-tint-ink") },
        accent: v("accent"),
        bar: v("success-bar"),
        warn: { tint: v("warn-tint"), ink: v("warn-ink") },
        danger: { DEFAULT: v("danger"), tint: v("danger-tint"), ink: v("danger-ink") },
        info: { tint: v("info-tint"), ink: v("info-ink") },
        "on-dark": { DEFAULT: v("on-dark"), muted: v("on-dark-muted"), faint: v("on-dark-faint"), warn: v("on-dark-warn"), bad: v("on-dark-bad") },
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        display: ["'Bricolage Grotesque'", "'Plus Jakarta Sans'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(14,35,24,.05), 0 8px 24px rgba(14,35,24,.06)",
        soft: "0 1px 2px rgba(14,35,24,.06)",
        glow: "0 8px 20px rgba(21,128,61,.3)",
        fab: "0 10px 24px rgba(21,128,61,.35)",
        nav: "0 12px 30px rgba(14,35,24,.28)",
        toast: "0 14px 34px rgba(14,35,24,.3)",
        menu: "0 2px 6px rgba(14,35,24,.08), 0 20px 44px rgba(14,35,24,.2)",
        sheet: "0 -10px 40px rgba(14,35,24,.2)",
        dark: "0 16px 36px rgba(14,35,24,.22)",
      },
    },
  },
  plugins: [],
};
export default config;
