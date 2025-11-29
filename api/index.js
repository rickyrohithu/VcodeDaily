const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const { processWithGroq } = require('./groqService');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const axios = require('axios');

const app = express();

// Middleware (MUST be before routes)
app.use(cors());
app.use(express.json());

// Supabase Setup
// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
    } catch (e) {
        console.error("Supabase Init Error:", e.message);
    }
} else {
    console.warn("⚠️ Missing SUPABASE_URL or SUPABASE_KEY. Database features will fail.");
}

// Route: Proxy Google Sheet (Bypass CORS)
app.post('/api/proxy-sheet', async (req, res) => {
    // ... (existing proxy logic)
});

// Route: Analyze URLs (New Endpoint)
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

            // Transform to CSV Export URL
            let csvUrl = url;
            if (url.includes('docs.google.com/spreadsheets')) {
                const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
                if (match) {
                    const sheetId = match[1];
                    csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
                }
            }

            try {
                const response = await axios.get(csvUrl, { responseType: 'arraybuffer' });

                // Parse CSV Buffer
                const stream = require('stream');
                const bufferStream = new stream.PassThrough();
                bufferStream.end(response.data);

                const parsedRows = await new Promise((resolve, reject) => {
                    const results = [];
                    bufferStream
                        .pipe(csv())
                        .on('data', (data) => results.push(data))
                        .on('end', () => resolve(results))
                        .on('error', (err) => reject(err));
                });

                rawData.push({
                    filename: name || 'Sheet',
                    content: parsedRows
                });
            } catch (err) {
                console.error(`Failed to fetch/parse ${url}:`, err.message);
            }
        }

        if (rawData.length === 0) {
            return res.status(400).json({ error: 'Failed to fetch any valid CSV data' });
        }

        console.log('Cleaning data (skipping full AI batch)...');
        const { cleanRawData } = require('./groqService');
        const problems = cleanRawData(rawData);

        res.json({
            message: 'Data fetched successfully',
            data: { problems, summary: {} } // Summary will be built by frontend after batching
        });

    } catch (error) {
        console.error('Error in /api/analyze-urls:', error);
        res.status(500).json({ error: error.message });
    }
});

// Middleware (Moved to top)

// Configure Multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// 1. PARSE CSV ONLY (Fast)
app.post('/api/parse-csv', upload.single('file'), async (req, res) => {
    try {
        console.log('📂 Received file upload request');
        if (!req.file) {
            console.error('❌ No file in req.file');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log(`📄 File: ${req.file.originalname}, Size: ${req.file.size} bytes, Type: ${req.file.mimetype}`);

        let results = [];
        const filename = req.file.originalname.toLowerCase();

        if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
            console.log('📊 Parsing as Excel...');
            const XLSX = require('xlsx');
            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Array of arrays

            console.log(`📊 Excel has ${jsonData.length} rows`);

            jsonData.forEach((row, index) => {
                if (index < 3) console.log(`Row ${index}:`, row); // Debug first 3 rows

                if (!row || row.length === 0) return;

                // Filter out Header Rows & Garbage
                const hasLink = row.some(val => val && val.toString().trim().includes('http')); // Relaxed check
                if (!hasLink) {
                    if (index < 5) console.log(`Skipping Row ${index} (No Link)`);
                    return;
                }

                const rowString = row.join(' ').toLowerCase();
                if (rowString.includes('problem name') || rowString.length < 10) return;

                results.push(row);
            });

        } else {
            console.log('📝 Parsing as CSV...');
            const stream = require('stream');
            const bufferStream = new stream.PassThrough();
            bufferStream.end(req.file.buffer);

            await new Promise((resolve, reject) => {
                let rowIndex = 0;
                bufferStream
                    .pipe(csv({ headers: false }))
                    .on('data', (data) => {
                        const row = Object.values(data).filter(val => val && val.trim() !== '');
                        if (rowIndex < 3) console.log(`Row ${rowIndex}:`, row); // Debug first 3 rows
                        rowIndex++;

                        if (row.length === 0) return;

                        const hasLink = row.some(val => val && val.toString().trim().includes('http')); // Relaxed check
                        if (!hasLink) return;

                        const rowString = row.join(' ').toLowerCase();
                        if (rowString.includes('problem name') || rowString.length < 10) return;

                        results.push(row);
                    })
                    .on('end', () => resolve(results))
                    .on('error', (err) => reject(err));
            });
        }

        console.log(`✅ Extracted ${results.length} valid problems.`);

        if (results.length === 0) {
            console.warn('⚠️ No valid problems found after filtering.');
            return res.status(400).json({ error: 'No valid problems found. Ensure your sheet has links (http/https).' });
        }

        // Convert raw rows to initial problem objects
        const rawProblems = results.map(row => {
            const name = row.find(v => v.length < 100 && !v.includes('http') && !v.match(/^\d+$/)) || "Unknown";
            const link = row.find(v => v.includes('http')) || "";
            const potentialTopic = row.find(v => v !== name && v !== link && v.length < 30 && !v.match(/^(Easy|Medium|Hard)$/i) && !v.match(/^\d+$/)) || "Uncategorized";
            const difficulty = row.find(v => v.match(/^(Easy|Medium|Hard)$/i)) || "Medium";

            return { name: name.trim(), link, topic: potentialTopic, difficulty, source: req.file.originalname };
        });

        res.json({ problems: rawProblems });

    } catch (error) {
        console.error('❌ CSV Parse Error:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ error: 'Failed to parse CSV', details: error.message });
    }
});

// 2. ANALYZE BATCH (Fast - called repeatedly by frontend)
app.post('/api/analyze-batch', async (req, res) => {
    try {
        const { problems, apiKey } = req.body;
        if (!problems || !Array.isArray(problems)) {
            return res.status(400).json({ error: 'Invalid problems array' });
        }

        const { processBatchWithGroq } = require('./groqService');
        const results = await processBatchWithGroq(problems, apiKey);

        res.json({ problems: results });

    } catch (error) {
        console.error('Batch Analysis Error:', error);
        res.status(500).json({ error: 'Analysis failed' });
    }
});

// Route: Generate Schedule
app.post('/api/generate-schedule', async (req, res) => {
    try {
        const { topicDays, problems, topicOrder, userEmail } = req.body;
        console.log('Generating schedule for:', topicDays);

        // Simple Round-Robin Schedule Generation
        const schedule = [];
        let currentDay = 1;

        // Group by topic
        const byTopic = {};
        problems.forEach(p => {
            const t = p.topic || 'Uncategorized';
            if (!byTopic[t]) byTopic[t] = [];
            byTopic[t].push(p);
        });

        // Sort topics based on user preference
        const sortedTopics = Object.keys(byTopic).sort((a, b) => {
            const orderA = (topicOrder && topicOrder[a]) || 999;
            const orderB = (topicOrder && topicOrder[b]) || 999;
            return orderA - orderB;
        });

        // Iterate topics
        for (const topic of sortedTopics) {
            const topicProbs = byTopic[topic];
            const days = parseInt(topicDays && topicDays[topic]) || 3;
            const probsPerDay = Math.ceil(topicProbs.length / days);

            for (let i = 0; i < topicProbs.length; i += probsPerDay) {
                schedule.push({
                    day: currentDay++,
                    topic: topic,
                    problems: topicProbs.slice(i, i + probsPerDay)
                });
            }
        }

        // Save to Supabase (Optional)
        if (supabase) {
            const emailToSave = userEmail || 'demo_user@example.com';
            await supabase.from('schedules').insert([{
                user_email: emailToSave,
                schedule_data: schedule,
                is_active: true
            }]);
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

// Route: Get User Schedule
app.get('/api/get-schedule', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
        const { data, error } = await supabase
            .from('schedules')
            .select('*')
            .eq('user_email', email)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            res.json({ schedule: data[0].schedule_data });
        } else {
            res.json({ schedule: null });
        }
    } catch (error) {
        console.error('Error fetching schedule:', error);
        res.status(500).json({ error: 'Failed to fetch schedule' });
    }
});

// Route: Update Progress (Tick/Untick Problem)
app.post('/api/update-progress', async (req, res) => {
    const { email, dayIndex, problemIndex, completed } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
        // 1. Fetch current schedule
        const { data, error } = await supabase
            .from('schedules')
            .select('*')
            .eq('user_email', email)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error || !data || data.length === 0) throw new Error('Schedule not found');

        const record = data[0];
        const schedule = record.schedule_data;

        // 2. Update the specific problem
        if (schedule[dayIndex] && schedule[dayIndex].problems[problemIndex]) {
            schedule[dayIndex].problems[problemIndex].completed = completed;
        } else {
            return res.status(400).json({ error: 'Invalid problem index' });
        }

        // 3. Save back to DB
        const { error: updateError } = await supabase
            .from('schedules')
            .update({ schedule_data: schedule })
            .eq('id', record.id);

        if (updateError) throw updateError;

        res.json({ success: true });

    } catch (error) {
        console.error('Error updating progress:', error);
        res.status(500).json({ error: 'Failed to update progress' });
    }
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', env: { supabase: !!supabase } });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('🔥 Global Error:', err);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Export for Vercel Serverless
module.exports = app;
