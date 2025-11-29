import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import csv from 'csv-parser';
import { Readable } from 'stream';
import Groq from 'groq-sdk';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || 'gsk_placeholder_key'
});

// Helper to parse CSV buffer
const parseCSV = (buffer: Buffer): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        const results: any[] = [];
        const stream = Readable.from(buffer);
        stream
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
};

// Helper to fetch CSV from URL
async function fetchCsvFromUrl(url: string) {
    try {
        let fetchUrl = url;
        if (url.includes('docs.google.com/spreadsheets')) {
            if (!url.includes('/export')) {
                fetchUrl = url.replace(/\/edit.*$/, '/export?format=csv');
                if (fetchUrl === url) {
                    fetchUrl = `${url.replace(/\/$/, '')}/export?format=csv`;
                }
            }
        }

        const response = await axios.get(fetchUrl, { responseType: 'arraybuffer' });
        return response.data;
    } catch (error: any) {
        console.error(`Failed to fetch CSV from ${url}:`, error.message);
        return null;
    }
}

async function processWithGroq(rawData: any[]) {
    let allProblems: string[] = [];
    rawData.forEach(file => {
        file.content.forEach((row: any) => {
            const values = Object.values(row) as string[];
            // Heuristic to find name and link
            const name = values.find(v => v && v.length < 100 && !v.startsWith('http') && !/^\d+$/.test(v));
            const link = values.find(v => v && v.startsWith('http'));

            if (name) {
                allProblems.push(`Name: ${name} | Link: ${link || 'N/A'} | Source: ${file.filename}`);
            }
        });
    });

    // Limit to avoid token limits
    const problemsSample = allProblems.slice(0, 100).join('\n');

    const systemPrompt = `
    You are an expert DSA Study Planner.
    I will provide a list of coding problems (Name | Link | Source).
    
    YOUR TASKS:
    1. Deduplicate problems.
    2. Categorize each problem into EXACTLY ONE of these topics:
       - Arrays & Strings
       - Math & Bit Manipulation
       - Searching
       - Sorting
       - Hashing
       - Recursion & Backtracking
       - Stacks & Queues
       - Linked Lists
       - Trees
       - Binary Search Trees (BST)
       - Heaps & Priority Queues
       - Graphs
    3. Determine the Difficulty (Easy, Medium, Hard) based on standard LeetCode difficulty.
    4. Extract or find the LeetCode link if present.

    OUTPUT FORMAT (JSON ONLY):
    {
      "summary": {
        "Topic Name": { "easy": 0, "medium": 0, "hard": 0 }
      },
      "problems": [
        { 
          "name": "Problem Name", 
          "topic": "Topic Name",
          "difficulty": "Easy",
          "link": "URL",
          "source": "Source Sheet"
        }
      ]
    }
    
    Ensure every problem from the input is accounted for. If a topic doesn't fit perfectly, choose the closest one from the list.
    `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Analyze these problems:\n${problemsSample}` }
            ],
            model: 'llama3-8b-8192',
            temperature: 0.1,
            response_format: { type: 'json_object' }
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("Empty response from Groq");
        return JSON.parse(content);

    } catch (error: any) {
        console.error('Groq API Error:', error.message);
        // Fallback Mock Data
        return {
            summary: {
                "Arrays & Strings": { easy: 2, medium: 1, hard: 0 },
                "Trees": { easy: 1, medium: 2, hard: 0 }
            },
            problems: [
                { name: "Two Sum", topic: "Arrays & Strings", difficulty: "Easy", link: "https://leetcode.com/problems/two-sum", source: "Mock" }
            ],
            message: "Generated via Mock Fallback (Groq API failed)"
        };
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { urls } = req.body;
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ error: 'No URLs provided' });
        }

        console.log(`Processing ${urls.length} URLs...`);
        const rawData = [];

        for (const urlObj of urls) {
            const { url, name } = urlObj;
            if (!url) continue;

            const buffer = await fetchCsvFromUrl(url);
            if (buffer) {
                const parsed = await parseCSV(buffer);
                rawData.push({
                    filename: name || 'Sheet',
                    content: parsed
                });
            }
        }

        if (rawData.length === 0) {
            return res.status(400).json({ error: 'Failed to fetch any valid CSV data' });
        }

        console.log('Sending data to Groq...');
        const groqResponse = await processWithGroq(rawData);

        res.status(200).json({
            message: 'Analysis complete',
            data: groqResponse
        });

    } catch (error: any) {
        console.error('Error in /api/analyze-urls:', error);
        res.status(500).json({ error: error.message });
    }
}
