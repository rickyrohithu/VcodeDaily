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

const axios = require('axios');
// ... (existing code)

// Helper to fetch CSV from URL
async function fetchCsvFromUrl(url) {
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
    } catch (error) {
        console.error(`Failed to fetch CSV from ${url}:`, error.message);
        return null;
    }
}

// Route: Analyze URLs
app.post('/api/analyze-urls', async (req, res) => {
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

        res.json({
            message: 'Analysis complete',
            data: groqResponse
        });

    } catch (error) {
        console.error('Error in /api/analyze-urls:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route: Upload and Process (Legacy)
app.post('/api/upload', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const rawData = [];
        for (const file of req.files) {
            const parsed = await parseCSV(file.buffer);
            rawData.push({
                filename: file.originalname,
                content: parsed
            });
        }

        const groqResponse = await processWithGroq(rawData);
        res.json({ message: 'Analysis complete', data: groqResponse });

    } catch (error) {
        console.error('Error in /api/upload:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route: Generate Schedule
app.post('/api/generate-schedule', async (req, res) => {
    try {
        const { topicDays, problems } = req.body;
        console.log('Generating schedule for:', topicDays);

        // Simple Round-Robin Schedule Generation
        // In a real app, we'd use Groq here too, but for now we'll use logic

        const schedule = [];
        let currentDay = 1;

        // Group by topic
        const byTopic = {};
        problems.forEach(p => {
            const t = p.topic || 'Uncategorized';
            if (!byTopic[t]) byTopic[t] = [];
            byTopic[t].push(p);
        });

        // Iterate topics
        for (const [topic, topicProbs] of Object.entries(byTopic)) {
            const days = parseInt(topicDays[topic]) || 3;
            const probsPerDay = Math.ceil(topicProbs.length / days);

            for (let i = 0; i < topicProbs.length; i += probsPerDay) {
                schedule.push({
                    day: currentDay++,
                    topic: topic,
                    problems: topicProbs.slice(i, i + probsPerDay)
                });
            }
        }

        res.json({
            message: 'Schedule generated successfully',
            schedule: schedule
        });

    } catch (error) {
        console.error('Error generating schedule:', error);
        res.status(500).json({ error: 'Failed to generate schedule' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
