import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Crescendo palette exposed as Tailwind utilities
        ink: {
          DEFAULT: "#0a0e27",
          muted: "#3a3f54",
          light: "#6b7280",
        },
        paper: {
          DEFAULT: "#ffffff",
          warm: "#fafaf7",
          soft: "#f8fafc",
          dark: "#0a0e27",
        },
        hairline: {
          DEFAULT: "rgba(10, 14, 39, 0.08)",
          warm: "#e0ddd4",
          input: "#d0cdc0",
        },
        brand: {
          blue: "#2563eb",
          violet: "#6366f1",
          gold: "#f59e0b",
          navy: "#0a0e27",
          "navy-light": "#1a1f4e",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: [
          "var(--font-fraunces)",
          "ui-serif",
          "Georgia",
          "serif",
        ],
      },
      boxShadow: {
        elevated:
          "0 1px 2px rgba(10,14,39,0.06), 0 20px 40px -20px rgba(10,14,39,0.20)",
        hairline: "0 1px 2px rgba(10,14,39,0.04)",
      },
      backgroundImage: {
        "gradient-hero":
          "linear-gradient(135deg, #0a0e27 0%, #1a1f4e 50%, #0a0e27 100%)",
        "gradient-cta": "linear-gradient(135deg, #0a0e27 0%, #2563eb 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
