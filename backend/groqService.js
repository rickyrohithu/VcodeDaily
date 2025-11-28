const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || 'gsk_placeholder_key'
});

async function processWithGroq(rawData) {
  // 1. Pre-process data to save tokens
  // We extract only the relevant columns (Problem Name, Link) from the CSVs
  // and flatten them into a single list string.

  let allProblems = [];
  rawData.forEach(file => {
    file.content.forEach(row => {
      // Try to find the problem name and link columns dynamically
      const values = Object.values(row);
      const name = values.find(v => v.length < 100 && !v.startsWith('http')) || values[0];
      const link = values.find(v => v.startsWith('http')) || '';

      if (name) {
        allProblems.push(`${name} | ${link} | Source: ${file.filename}`);
      }
    });
  });

  // Limit to 50 problems for the prototype to ensure we don't hit token limits immediately
  // In production, we'd batch this or use a larger context model.
  const problemsSample = allProblems.slice(0, 50).join('\n');

  const systemPrompt = `
    You are an expert DSA Study Planner.
    I will give you a list of coding problems (Name | Link | Source).
    
    YOUR TASKS:
    1. Deduplicate problems (e.g., "Two Sum" and "2 Sum" are the same).
    2. Identify the Topic (e.g., Arrays, DP, Graphs, Trees).
    3. Identify the Difficulty (Easy, Medium, Hard).
    4. Return a JSON object with a "summary" of counts and the full "problems" list.

    OUTPUT FORMAT (JSON ONLY):
    {
      "summary": {
        "Topic Name": { "easy": 0, "medium": 0, "hard": 0 }
      },
      "problems": [
        { 
          "name": "Standardized Name", 
          "source": "Original Source Name", 
          "difficulty": "Easy",
          "topic": "Topic Name",
          "link": "URL"
        }
      ]
    }
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

    const result = JSON.parse(completion.choices[0].message.content);
    return result;

  } catch (error) {
    console.error('Groq API Error:', error.message);

    // Fallback Mock Data
    return {
      summary: {
        "Arrays & Hashing": { easy: 5, medium: 8, hard: 2 },
        "Two Pointers": { easy: 3, medium: 5, hard: 1 },
        "Dynamic Programming": { easy: 2, medium: 12, hard: 5 }
      },
      problems: [],
      message: "Generated via Mock Fallback (Groq API failed)"
    };
  }
}

module.exports = { processWithGroq };
