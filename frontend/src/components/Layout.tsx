import React, { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-primary to-secondary text-white">
            <header className="p-4 shadow-lg bg-primary/80">
                <h1 className="text-2xl font-bold">DSA Sheet App</h1>
            </header>
            <main className="container mx-auto py-8">
                {children}
            </main>
            <footer className="p-4 text-center text-sm text-gray-300">
                © {new Date().getFullYear()} DSA Sheet Converter
            </footer>
        </div>
    );
}
