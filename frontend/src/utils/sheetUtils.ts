export interface Problem {
    name: string;
    link: string;
    topic: string;
    difficulty: string;
    source: string;
}

export function extractProblemsFromRowData(rows: any[], source: string): Problem[] {
    const problems: Problem[] = [];
    rows.forEach(row => {
        if (!row || (Array.isArray(row) && row.length === 0)) return;

        const rowValues = Array.isArray(row) ? row : Object.values(row);

        const hasLink = rowValues.some(v => v && v.toString().includes('http'));
        const hasName = rowValues.some(v => v && v.toString().length > 3 && !v.toString().match(/^\d+$/));

        if (!hasLink && !hasName) return;

        const name = rowValues.find(v => v && v.toString().length < 100 && !v.toString().includes('http') && !v.toString().match(/^\d+$/)) || "Unknown";
        const link = rowValues.find(v => v && v.toString().includes('http')) || "";

        let topic = rowValues.find(v =>
            v &&
            v.toString() !== name &&
            v.toString() !== link &&
            v.toString().length < 40 &&
            !v.toString().match(/^(Easy|Medium|Hard)$/i)
        ) || "Uncategorized";

        const difficulty = rowValues.find(v => v && v.toString().match(/^(Easy|Medium|Hard)$/i)) || "Medium";

        problems.push({
            name: typeof name === 'string' ? name.trim() : String(name).trim(),
            link: String(link),
            topic: String(topic),
            difficulty: String(difficulty),
            source
        });
    });
    return problems;
}
