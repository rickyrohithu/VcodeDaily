const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const { processWithGroq } = require('./groqService');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

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

// Middleware
app.use(cors());
app.use(express.json());

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
        const { problems } = req.body;
        if (!problems || !Array.isArray(problems)) {
            return res.status(400).json({ error: 'Invalid problems array' });
        }

        const { processBatchWithGroq } = require('./groqService');
        const results = await processBatchWithGroq(problems);

        res.json({ problems: results });

    } catch (error) {
        console.error('Batch Analysis Error:', error);
        res.status(500).json({ error: 'Analysis failed' });
    }
});

// Route: Generate Schedule
app.post('/api/generate-schedule', async (req, res) => {
    try {
        let { topicDays, problems, userEmail, topicOrder } = req.body;

        topicDays = topicDays || {};
        topicOrder = topicOrder || {};

        console.log('Generating schedule for:', Object.keys(topicDays));
        console.log(`Received ${problems ? problems.length : 0} problems.`);

        if (!problems || problems.length === 0) {
            console.warn('No problems received. Using Mock Data for fallback.');
            // Fallback to Mock if no problems (prevents crash)
            const mockSchedule = [
                { day: 1, topic: "Fallback Topic", problems: [{ name: "Sample Problem", source: "System", difficulty: "Easy" }] }
            ];
            return res.json({ message: 'No problems provided, returned mock.', schedule: mockSchedule });
        }

        // Filter out nulls/invalid problems
        const validProblems = problems.filter(p => p && p.name);
        console.log(`Processing ${validProblems.length} valid problems.`);

        // ALGORITHMIC SCHEDULE GENERATION (Weighted "Equal Hardwork" Distribution)
        // Logic: Hard=4pts, Medium=2pts, Easy=1pt.
        // Goal: Balance points per day.

        let finalSchedule = [];
        let currentDayOffset = 0;

        // 1. Group problems by Topic
        const problemsByTopic = {};
        validProblems.forEach(p => {
            const topic = p.topic || "Uncategorized";
            if (!problemsByTopic[topic]) problemsByTopic[topic] = [];
            problemsByTopic[topic].push(p);
        });

        // 2. Sort Topics based on User Order
        const sortedTopics = Object.keys(problemsByTopic).sort((a, b) => {
            const orderA = (topicOrder && topicOrder[a]) || 999;
            const orderB = (topicOrder && topicOrder[b]) || 999;
            return orderA - orderB;
        });

        // 3. Distribute per Topic
        for (const topic of sortedTopics) {
            const topicProblems = problemsByTopic[topic];
            const daysAllocated = parseInt(topicDays[topic]) || 3;

            // Sort problems by difficulty (Hard -> Medium -> Easy) to distribute heavy ones first
            const difficultyWeight = { "Hard": 4, "Medium": 2, "Easy": 1 };
            topicProblems.sort((a, b) => {
                const wA = difficultyWeight[a.difficulty] || 2;
                const wB = difficultyWeight[b.difficulty] || 2;
                return wB - wA; // Descending order
            });

            // Calculate Total Points
            const totalPoints = topicProblems.reduce((sum, p) => sum + (difficultyWeight[p.difficulty] || 2), 0);
            const targetPointsPerDay = Math.ceil(totalPoints / daysAllocated);

            let pIndex = 0;
            for (let i = 0; i < daysAllocated; i++) {
                const dayProblems = [];
                let currentDayPoints = 0;

                // Fill day until target points reached (or run out of problems)
                // We allow slightly going over target to ensure we don't leave stragglers, 
                // but we stop if we are close enough.
                while (pIndex < topicProblems.length) {
                    const p = topicProblems[pIndex];
                    const pPoints = difficultyWeight[p.difficulty] || 2;

                    // If adding this problem exceeds target significantly, and we already have something, stop.
                    // Exception: If it's the last day, take everything.
                    if (i < daysAllocated - 1 && currentDayPoints + pPoints > targetPointsPerDay + 2 && dayProblems.length > 0) {
                        break;
                    }

                    dayProblems.push({
                        name: p.name,
                        source: p.source,
                        difficulty: p.difficulty,
                        link: p.link || "",
                        completed: false
                    });
                    currentDayPoints += pPoints;
                    pIndex++;

                    // If we met or exceeded target, stop for this day
                    if (currentDayPoints >= targetPointsPerDay) break;
                }

                if (dayProblems.length > 0) {
                    finalSchedule.push({
                        day: currentDayOffset + i + 1,
                        topic: topic,
                        problems: dayProblems
                    });
                }
            }

            // If any problems remain (due to math rounding), add them to the last day of this topic
            if (pIndex < topicProblems.length) {
                const lastDay = finalSchedule[finalSchedule.length - 1];
                if (lastDay && lastDay.topic === topic) {
                    while (pIndex < topicProblems.length) {
                        const p = topicProblems[pIndex];
                        lastDay.problems.push({
                            name: p.name,
                            source: p.source,
                            difficulty: p.difficulty,
                            link: p.link || "",
                            completed: false
                        });
                        pIndex++;
                    }
                }
            }

            currentDayOffset += daysAllocated;
        }

        console.log(`Generated ${finalSchedule.length} days of weighted schedule.`);
        // Save to Supabase
        // Note: We need userEmail. For now, we'll use a placeholder if not provided,
        // but ideally the frontend sends the logged-in user's email.
        const emailToSave = userEmail || 'demo_user@example.com';
        let dbRecord = null;
        if (supabase) {
            console.log(`Attempting to save schedule for ${emailToSave} to Supabase...`);
            const { data, error } = await supabase
                .from('schedules')
                .insert([
                    {
                        user_email: emailToSave,
                        schedule_data: finalSchedule,
                        is_active: true
                    }
                ])
                .select();

            if (error) {
                console.error('❌ Supabase Insert Error:', JSON.stringify(error, null, 2));
            } else {
                console.log('✅ Schedule saved to DB:', data);
                dbRecord = data ? data[0] : null;
            }
        } else {
            console.warn('⚠️ Supabase not configured. Schedule NOT saved to DB.');
        }

        res.json({
            message: 'Schedule generated and saved successfully',
            schedule: finalSchedule,
            db_record: dbRecord
        });

    } catch (error) {
        console.error('❌ Error generating schedule:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ error: 'Failed to generate schedule', details: error.message });
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
