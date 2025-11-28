const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || 'gsk_placeholder_key'
});

async function processWithGroq(rawData) {
  // 1. Pre-process data to save tokens
  // We extract only the relevant columns (Problem Name, Link) from the CSVs
  // 1. Deduplicate & Aggregate Sources
  const problemMap = new Map(); // Name -> { link, sources: Set }

  rawData.forEach(file => {
    // STRICTLY Clean filename: remove .csv, .xlsx, .xls (case insensitive)
    let cleanSource = file.filename.replace(/\.(csv|xlsx|xls)$/i, '').trim();

    file.content.forEach(row => {
      // Row is array: ['Two Sum', 'http...', 'Easy']
      // Find the name (longest string that isn't a URL)
      const name = row.find(v => v.length < 100 && !v.startsWith('http') && !v.match(/^\d+$/));
      const link = row.find(v => v.startsWith('http')) || '';

      if (name) {
        const cleanName = name.trim();
        if (!problemMap.has(cleanName)) {
          problemMap.set(cleanName, { link, sources: new Set() });
        }
        // Add the clean source name to the set (automatically handles duplicates)
        problemMap.get(cleanName).sources.add(cleanSource);

        // Update link if the current one is better (exists)
        if (!problemMap.get(cleanName).link && link) {
          problemMap.get(cleanName).link = link;
        }
      }
    });
  });

  const uniqueProblems = Array.from(problemMap.keys());

  // Limit to 400 unique problems for Free Tier
  const problemNames = uniqueProblems.slice(0, 400);

  const systemPrompt = `
    You are an expert DSA Study Planner.
    I will give you a list of coding problem names.
    
    YOUR TASKS:
    1. Identify the Topic (e.g., Arrays, DP, Graphs).
    2. Identify the Difficulty (Easy, Medium, Hard).
    3. Return a JSON object mapping names to their classification.

    OUTPUT FORMAT (JSON ONLY):
    {
      "summary": {
        "Topic Name": { "easy": 0, "medium": 0, "hard": 0 }
      },
      "classifications": {
        "Problem Name": { "topic": "Topic", "difficulty": "Easy" }
      }
    }
  `;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Classify these problems:\n${JSON.stringify(problemNames)}` }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(completion.choices[0].message.content);

    // Re-hydrate with merged sources
    const finalProblems = problemNames.map(name => {
      const data = problemMap.get(name);
      const classification = result.classifications[name] || { topic: "Uncategorized", difficulty: "Medium" };

      return {
        name: name,
        link: data.link,
        source: Array.from(data.sources).join(', '), // Merges sources: "s1, s2"
        topic: classification.topic,
        difficulty: classification.difficulty
      };
    });

    return {
      summary: result.summary,
      problems: finalProblems
    };

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
