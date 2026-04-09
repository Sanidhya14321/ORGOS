import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./store/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#121826",
        mist: "#f7f7f2",
        ember: "#ff6b35",
        moss: "#2a9d8f",
        sand: "#e9c46a"
      }
    }
  },
  plugins: []
};

export default config;
