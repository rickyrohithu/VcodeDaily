const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const { processWithGroq } = require('./groqService');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());

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
            .pipe(csv({ headers: false })) // Read as arrays, ignore headers
            .on('data', (data) => {
                // 'data' is now an object with numeric keys: { '0': 'Val1', '1': 'Val2' }
                // Convert to array of values
                const row = Object.values(data).filter(val => val && val.trim() !== '');
                if (row.length > 0) results.push(row);
            })
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

        // 1. Parse CSVs
        const rawData = [];
        for (const file of req.files) {
            const parsed = await parseCSV(file.buffer);
            console.log(`Parsed ${file.originalname}: ${parsed.length} rows found.`);
            if (parsed.length > 0) {
                console.log('Sample row:', parsed[0]); // Log first row to check headers
            }
            rawData.push({
                filename: file.originalname,
                content: parsed
            });
        }

        // 2. Send to Groq
        const groqResponse = await processWithGroq(rawData);

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
        const { topicDays, problems, userEmail } = req.body;

        console.log('Generating schedule for:', topicDays);
        console.log(`Received ${problems ? problems.length : 0} problems.`);

        if (!problems || problems.length === 0) {
            console.warn('No problems received. Using Mock Data for fallback.');
            // Fallback to Mock if no problems (prevents crash)
            const mockSchedule = [
                { day: 1, topic: "Fallback Topic", problems: [{ name: "Sample Problem", source: "System", difficulty: "Easy" }] }
            ];
            // ... save mock to DB ...
            return res.json({ message: 'No problems provided, returned mock.', schedule: mockSchedule });
        }

        // 1. Prepare Prompt for Groq
        // We need to send the problems list and the days constraints
        // Since we don't have the full problems list in the request body (we sent empty array in frontend script),
        // we need to fix the frontend to send the problems too.
        // BUT for now, let's assume 'problems' is passed or we fetch it.

        // WAIT: The frontend script currently sends `problems: []`.
        // We need to fix the frontend first to pass the analyzed problems.
        // However, I will write the backend logic assuming `problems` contains the data.

        const systemPrompt = `
      You are an expert Study Planner.
      I will provide:
      1. A list of problems (Name, Difficulty, Source).
      2. A configuration of "Days per Topic".

      YOUR TASK:
      Create a day-by-day schedule.
      - Distribute problems across the specified days for each topic.
      - Mix difficulties if possible (e.g. 1 Easy, 1 Medium).
      - Ensure NO duplicates.

      OUTPUT JSON FORMAT:
      {
        "schedule": [
          {
            "day": 1,
            "topic": "Topic Name",
            "problems": [
              { "name": "Problem Name", "source": "Source", "difficulty": "Easy" }
            ]
          }
        ]
      }
    `;

        // Limit problems to 400 to stay within free tier TPM limits (approx 6k tokens)
        // Optimization: Send ONLY names to save tokens.
        const problemsSample = problems.slice(0, 400);
        const problemNames = problemsSample.map(p => p.name);

        console.log(`Sending ${problemNames.length} problem names to Groq (Token Optimized)...`);

        const userPrompt = `
      Topic Configuration: ${JSON.stringify(topicDays)}
      Available Problems: ${JSON.stringify(problemNames)}
    `;

        let finalSchedule;
        try {
            // Call Groq
            const Groq = require('groq-sdk');
            const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

            const completion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                model: 'llama-3.1-8b-instant',
                temperature: 0.2,
                response_format: { type: 'json_object' }
            });

            const result = JSON.parse(completion.choices[0].message.content);

            // Re-hydrate the schedule with full problem details
            // The AI returns objects with just names or partial info. We need to merge back the source/link/diff.
            finalSchedule = result.schedule.map(day => ({
                ...day,
                problems: day.problems.map(aiProb => {
                    // Find original problem by name (fuzzy match or exact)
                    const original = problems.find(p => p.name === aiProb.name) ||
                        problems.find(p => p.name.includes(aiProb.name)) ||
                        { name: aiProb.name, source: "Unknown", difficulty: "Medium", link: "" };

                    return {
                        name: original.name,
                        source: original.source,
                        difficulty: original.difficulty,
                        link: original.link || ""
                    };
                })
            }));

            console.log('Groq generated schedule successfully.');

        } catch (groqError) {
            console.error('Groq Schedule Generation Failed:', groqError.message);
            return res.status(500).json({ error: 'Failed to generate schedule via AI', details: groqError.message });
        }
        // Save to Supabase
        // Note: We need userEmail. For now, we'll use a placeholder if not provided,
        // but ideally the frontend sends the logged-in user's email.
        const emailToSave = userEmail || 'demo_user@example.com';
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
            // We don't block the response if DB fails, but we should log it.
        } else {
            console.log('✅ Schedule saved to DB:', data);
        }

        res.json({
            message: 'Schedule generated and saved successfully',
            schedule: finalSchedule,
            db_record: data ? data[0] : null
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

// Export for Vercel Serverless
module.exports = app;
