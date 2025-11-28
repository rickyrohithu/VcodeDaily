const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const { processWithGroq } = require('./groqService');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase Setup (Placeholder for now, will use env vars later)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
// const supabase = createClient(supabaseUrl, supabaseKey);

// Configure Multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Helper to parse CSV buffer
const parseCSV = (buffer) => {
    return new Promise((resolve, reject) => {
        const results = [];
        const stream = require('stream');
        const bufferStream = new stream.PassThrough();
        bufferStream.end(buffer);

        bufferStream
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
};

// Route: Upload and Process
app.post('/api/upload', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        console.log(`Received ${req.files.length} files.`);

        // 1. Parse CSVs
        const rawData = [];
        for (const file of req.files) {
            const parsed = await parseCSV(file.buffer);
            rawData.push({
                filename: file.originalname,
                content: parsed
            });
        }

        // 2. Send to Groq
        console.log('Sending parsed data to Groq...');
        const groqResponse = await processWithGroq(rawData);

        // 3. Return response
        res.json({
            message: 'Analysis complete',
            data: groqResponse
        });

    } catch (error) {
        console.error('Error in /api/upload:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// Route: Generate Schedule
app.post('/api/generate-schedule', async (req, res) => {
    try {
        const { topicDays, problems } = req.body;

        console.log('Generating schedule for:', topicDays);

        // MOCK SCHEDULE GENERATION (Placeholder for Groq call)
        // In real app, we would send this data to Groq to get a smart schedule
        const mockSchedule = [
            {
                day: 1,
                topic: "Arrays & Hashing",
                problems: [
                    { name: "Two Sum", source: "Striver Sheet", difficulty: "Easy" },
                    { name: "Contains Duplicate", source: "Blind 75", difficulty: "Easy" },
                    { name: "Valid Anagram", source: "NeetCode 150", difficulty: "Easy" }
                ]
            },
            {
                day: 2,
                topic: "Arrays & Hashing",
                problems: [
                    { name: "Group Anagrams", source: "Striver Sheet", difficulty: "Medium" },
                    { name: "Top K Frequent Elements", source: "Blind 75", difficulty: "Medium" }
                ]
            },
            {
                day: 3,
                topic: "Two Pointers",
                problems: [
                    { name: "Valid Palindrome", source: "Striver Sheet", difficulty: "Easy" },
                    { name: "3Sum", source: "NeetCode 150", difficulty: "Medium" }
                ]
            },
            {
                day: 4,
                topic: "Two Pointers",
                problems: [
                    { name: "Container With Most Water", source: "Blind 75", difficulty: "Medium" },
                    { name: "Trapping Rain Water", source: "Striver Sheet", difficulty: "Hard" }
                ]
            },
            {
                day: 5,
                topic: "Dynamic Programming",
                problems: [
                    { name: "Climbing Stairs", source: "Striver Sheet", difficulty: "Easy" },
                    { name: "Min Cost Climbing Stairs", source: "NeetCode 150", difficulty: "Easy" }
                ]
            }
        ];

        res.json({
            message: 'Schedule generated successfully',
            schedule: mockSchedule
        });

    } catch (error) {
        console.error('Error generating schedule:', error);
        res.status(500).json({ error: 'Failed to generate schedule' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
