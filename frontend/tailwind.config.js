/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Semantic surface tokens driven by CSS variables (see index.css).
        // Light keeps the existing #FAFAFC / white look; dark uses the
        // deep slate-blue the Workstream sidebar already uses.
        canvas: "rgb(var(--ws-canvas) / <alpha-value>)",
        surface: "rgb(var(--ws-surface) / <alpha-value>)",
        "surface-muted": "rgb(var(--ws-surface-muted) / <alpha-value>)",
        "surface-inset": "rgb(var(--ws-surface-inset) / <alpha-value>)",
        line: "rgb(var(--ws-line) / <alpha-value>)",
        ink: "rgb(var(--ws-ink) / <alpha-value>)",
        "ink-muted": "rgb(var(--ws-ink-muted) / <alpha-value>)",
        "ink-subtle": "rgb(var(--ws-ink-subtle) / <alpha-value>)",
      },
    },
  },
  plugins: [],
}
