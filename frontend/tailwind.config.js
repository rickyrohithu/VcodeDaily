/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx}",
        "./public/**/*.html",
    ],
    theme: {
        extend: {
            colors: {
                primary: "#1e40af",
                secondary: "#64748b",
                accent: "#10b981",
            },
        },
    },
    plugins: [],
};
