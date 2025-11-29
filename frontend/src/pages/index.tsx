import React, { useState } from "react";
import * as XLSX from 'xlsx';
import { extractProblemsFromRowData, Problem } from '../utils/sheetUtils';

export default function Home() {
    const [sheets, setSheets] = useState([{ name: "", url: "" }]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<Record<string, { easy: number, medium: number, hard: number }>>({});

    const addSheet = () => {
        if (sheets.length < 10) {
            setSheets([...sheets, { name: "", url: "" }]);
        }
    };

    const updateSheet = (index: number, field: "name" | "url", value: string) => {
        const newSheets = [...sheets];
        newSheets[index][field] = value;
        setSheets(newSheets);
    };

    const handleAnalyse = async () => {
        setIsAnalyzing(true);
        setAnalysisResult({});
        const allProblems: Problem[] = [];

        try {
            for (const sheet of sheets) {
                if (!sheet.url) continue;

                try {
                    const res = await fetch('/api/proxy-sheet', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: sheet.url })
                    });

                    if (!res.ok) {
                        console.error(`Failed to fetch ${sheet.name}`);
                        continue;
                    }

                    const { data } = await res.json();
                    const workbook = XLSX.read(data, { type: 'base64' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    const problems = extractProblemsFromRowData(jsonData as any[], sheet.name || "Sheet");
                    allProblems.push(...problems);
                } catch (err) {
                    console.error(`Error processing sheet ${sheet.name}:`, err);
                }
            }

            if (allProblems.length === 0) {
                alert("No problems found in the provided sheets.");
                return;
            }

            // Calculate summary
            const summary: Record<string, { easy: number, medium: number, hard: number }> = {};
            const STANDARD_TOPICS = ["Arrays", "Strings", "Linked Lists", "Stacks", "Queues", "Trees", "Heaps / Priority Queues", "Hashing", "Graphs", "Dynamic Programming (DP)", "Recursion & Backtracking", "Sorting & Searching", "Greedy Algorithms"];

            STANDARD_TOPICS.forEach(t => summary[t] = { easy: 0, medium: 0, hard: 0 });

            allProblems.forEach(p => {
                let topic = p.topic;
                let matched = STANDARD_TOPICS.find(t => topic.toLowerCase().includes(t.toLowerCase().split(' ')[0])) || "Arrays";

                if (!summary[matched]) summary[matched] = { easy: 0, medium: 0, hard: 0 };

                const diff = (p.difficulty || "Medium").toLowerCase();
                if (diff.includes('easy')) summary[matched].easy++;
                else if (diff.includes('hard')) summary[matched].hard++;
                else summary[matched].medium++;
            });

            setAnalysisResult(summary);

        } catch (error) {
            console.error("Analysis failed", error);
            alert("Analysis failed. See console for details.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-900 via-[#1a1b26] to-black">
            <div className="w-full max-w-xl">
                <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 md:p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                    <div className="text-center mb-10">
                        <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">
                            Manage Your Sheets
                        </h1>
                        <p className="text-gray-400 text-sm">
                            Add up to 10 sheets to track your progress
                        </p>
                    </div>

                    <div className="space-y-4 mb-8">
                        {sheets.map((sheet, index) => (
                            <div key={index} className="space-y-2">
                                <input
                                    type="url"
                                    placeholder="Paste Google Sheet URL (Make sure it's Public)"
                                    value={sheet.url}
                                    onChange={(e) => updateSheet(index, "url", e.target.value)}
                                    className="w-full bg-[#1a1b26]/50 border border-purple-500/30 rounded-xl px-5 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                                />
                                {/* Hidden name input for now, or subtle */}
                                <input
                                    type="text"
                                    placeholder="Sheet Name (Optional)"
                                    value={sheet.name}
                                    onChange={(e) => updateSheet(index, "name", e.target.value)}
                                    className="w-full bg-transparent border-none text-xs text-gray-500 focus:text-gray-300 px-5 focus:outline-none"
                                />
                            </div>
                        ))}

                        {sheets.length < 10 && (
                            <button
                                onClick={addSheet}
                                className="text-xs text-gray-500 hover:text-white transition-colors ml-5"
                            >
                                + Add another sheet
                            </button>
                        )}
                    </div>

                    <button
                        onClick={handleAnalyse}
                        disabled={isAnalyzing}
                        className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-gray-100 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isAnalyzing ? 'Processing...' : 'Analyse Sheet'}
                    </button>
                </div>

                {/* Results Section */}
                {Object.keys(analysisResult).length > 0 && (
                    <div className="mt-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 animate-fade-in">
                        <h2 className="text-2xl font-bold mb-6 text-center text-white">Topic Analysis</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {Object.entries(analysisResult).map(([topic, counts]) => {
                                const total = counts.easy + counts.medium + counts.hard;
                                if (total === 0) return null;
                                return (
                                    <div key={topic} className="bg-black/20 p-4 rounded-xl border border-white/5">
                                        <h3 className="text-blue-300 text-sm font-semibold mb-2 truncate">{topic}</h3>
                                        <div className="flex justify-between text-xs text-gray-400">
                                            <span>T: {total}</span>
                                            <div className="space-x-1">
                                                <span className="text-green-400">{counts.easy}</span>
                                                <span className="text-yellow-400">{counts.medium}</span>
                                                <span className="text-red-400">{counts.hard}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
