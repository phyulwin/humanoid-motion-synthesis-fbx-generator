// File: kinetix-studio/frontend/tailwind.config.ts
// This file declares the content paths and custom theme extensions for Tailwind CSS.

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#050712",
        panel: "#0c1020",
        accent: "#d8ff28",
        ember: "#ff9463",
        haze: "#6ef2ff"
      },
      boxShadow: {
        glow: "0 0 24px rgba(216, 255, 40, 0.24)"
      }
    }
  },
  plugins: []
};

export default config;