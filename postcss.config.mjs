// postcss.config.mjs
// Tailwind CSS v4 uses the Vite plugin for processing, but PostCSS is still needed
// for some edge cases and compatibility

export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
