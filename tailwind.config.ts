import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--tw-border))",
        background: "hsl(var(--tw-background))",
        foreground: "hsl(var(--tw-foreground))",
        primary: {
          DEFAULT: "hsl(var(--tw-primary))",
          foreground: "hsl(var(--tw-primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--tw-secondary))",
          foreground: "hsl(var(--tw-secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--tw-muted))",
          foreground: "hsl(var(--tw-muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--tw-accent))",
          foreground: "hsl(var(--tw-accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--tw-card))",
          foreground: "hsl(var(--tw-card-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--tw-destructive))",
          foreground: "hsl(var(--tw-destructive-foreground))",
        },
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      keyframes: {
        /* ─── Legacy ─── */
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        /* ─── Entrance ─── */
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-28px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(28px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.93) translateY(10px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        /* ─── Continuous ─── */
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        /* ─── Shimmer sweep ─── */
        shimmer: {
          from: { backgroundPosition: "-200% center" },
          to: { backgroundPosition: "200% center" },
        },
        /* ─── Timeline line draw ─── */
        "draw-line": {
          from: { height: "0%", opacity: "0" },
          to: { height: "100%", opacity: "1" },
        },
        /* ─── Notification pop ─── */
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.8) translateY(6px)" },
          "70%": { transform: "scale(1.04) translateY(-1px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        /* ─── Ping ring ─── */
        "ping-ring": {
          "75%, 100%": { transform: "scale(1.6)", opacity: "0" },
        },
        /* ─── Gradient slide ─── */
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.4s ease-out forwards",
        "slide-in-left": "slide-in-left 0.6s cubic-bezier(0.16,1,0.3,1) forwards",
        "slide-in-right": "slide-in-right 0.6s cubic-bezier(0.16,1,0.3,1) forwards",
        "scale-in": "scale-in 0.5s cubic-bezier(0.16,1,0.3,1) forwards",
        "fade-in": "fade-in 0.5s ease-out forwards",
        float: "float 3.5s ease-in-out infinite",
        "float-slow": "float-slow 4.5s ease-in-out infinite",
        "spin-slow": "spin-slow 8s linear infinite",
        shimmer: "shimmer 2.4s linear infinite",
        "draw-line": "draw-line 1s ease-out forwards",
        "pop-in": "pop-in 0.4s cubic-bezier(0.16,1,0.3,1) forwards",
        "ping-ring": "ping-ring 1.2s cubic-bezier(0,0,0.2,1) infinite",
        "gradient-x": "gradient-x 4s ease infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
