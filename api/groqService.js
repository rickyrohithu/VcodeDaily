const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || 'gsk_placeholder_key'
});

// STANDARD TOPICS LIST
const ALLOWED_TOPICS = [
  "Arrays", "Strings", "Linked Lists", "Stacks", "Queues",
  "Trees", "Heaps / Priority Queues", "Hashing", "Graphs",
  "Dynamic Programming (DP)", "Recursion & Backtracking",
  "Sorting & Searching", "Greedy Algorithms",
  "Bit Manipulation", "Math", "Two Pointers", "Sliding Window",
  "Union Find", "Trie", "Segment Tree"
];

// Helper to map any string to a Standard Topic
const normalizeTopic = (input) => {
  if (!input) return "Uncategorized";
  const lower = input.toLowerCase();

  if (lower.includes("bit") || lower.includes("binary")) return "Bit Manipulation";
  if (lower.includes("dp") || lower.includes("dynamic")) return "Dynamic Programming (DP)";
  if (lower.includes("recursion") || lower.includes("backtrack")) return "Recursion & Backtracking";
  if (lower.includes("tree") || lower.includes("bst")) return "Trees";
  if (lower.includes("graph") || lower.includes("bfs") || lower.includes("dfs")) return "Graphs";
  if (lower.includes("linked list")) return "Linked Lists";
  if (lower.includes("stack")) return "Stacks";
  if (lower.includes("queue") && !lower.includes("priority")) return "Queues";
  if (lower.includes("heap") || lower.includes("priority queue")) return "Heaps / Priority Queues";
  if (lower.includes("hash") || lower.includes("map") || lower.includes("set")) return "Hashing";
  if (lower.includes("sort") || lower.includes("search") || lower.includes("binary search")) return "Sorting & Searching";
  if (lower.includes("greedy")) return "Greedy Algorithms";
  if (lower.includes("math") || lower.includes("geometry")) return "Math";
  if (lower.includes("pointer")) return "Two Pointers";
  if (lower.includes("sliding")) return "Sliding Window";
  if (lower.includes("union")) return "Union Find";
  if (lower.includes("trie")) return "Trie";
  if (lower.includes("segment")) return "Segment Tree";
  if (lower.includes("string")) return "Strings";
  if (lower.includes("array")) return "Arrays";

  return "Uncategorized"; // Safer fallback
};

async function processWithGroq(rawData) {
  // 1. Pre-process data to save tokens
  // We extract only the relevant columns (Problem Name, Link) from the CSVs
  // 1. Deduplicate & Aggregate Sources
  const problemMap = new Map(); // Name -> { link, sources: Set }

  rawData.forEach(file => {
    // STRICTLY Clean filename: remove .csv, .xlsx, .xls (case insensitive)
    let cleanSource = file.filename.replace(/\.(csv|xlsx|xls)$/i, '').trim();

    file.content.forEach(rawRow => {
      // Ensure row is an array of values (csv-parser returns objects by default)
      const row = Array.isArray(rawRow) ? rawRow : Object.values(rawRow);

      // Row is array: ['Two Sum', 'http...', 'Easy', 'Arrays']
      // Find the name (longest string that isn't a URL)
      const name = row.find(v => v && v.length < 100 && !v.startsWith('http') && !v.match(/^\d+$/));
      const link = row.find(v => v.startsWith('http')) || '';

      // Try to find a Topic (shorter string, not name, not link, not difficulty)
      const potentialTopic = row.find(v =>
        v !== name &&
        v !== link &&
        v.length < 30 &&
        !v.match(/^(Easy|Medium|Hard)$/i) &&
        !v.match(/^\d+$/)
      );

      // Try to find Difficulty
      const difficulty = row.find(v => v.match(/^(Easy|Medium|Hard)$/i)) || "Medium";

      if (name) {
        const cleanName = name.trim();
        if (!problemMap.has(cleanName)) {
          problemMap.set(cleanName, {
            link,
            sources: new Set(),
            topic: potentialTopic || "Uncategorized", // Use found topic
            difficulty: difficulty
          });
        }
        // Add the clean source name to the set
        problemMap.get(cleanName).sources.add(cleanSource);

        // Update link if better
        if (!problemMap.get(cleanName).link && link) {
          problemMap.get(cleanName).link = link;
        }
        // Update topic if we found one and previous was Uncategorized
        if (potentialTopic && problemMap.get(cleanName).topic === "Uncategorized") {
          problemMap.get(cleanName).topic = potentialTopic;
        }
      }
    });
  });

  const uniqueProblems = Array.from(problemMap.keys());

  // Limit to 1000 unique problems for Free Tier
  const problemNames = uniqueProblems.slice(0, 1000);

  // BATCHED PROCESSING
  const BATCH_SIZE = 25;
  const chunks = [];
  for (let i = 0; i < problemNames.length; i += BATCH_SIZE) {
    chunks.push(problemNames.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${problemNames.length} problems in ${chunks.length} batches...`);

  const processBatch = async (batchNames) => {
    const systemPrompt = `
        You are an expert DSA Study Planner.
        Classify the given problems into EXACTLY one of these topics:
        ${JSON.stringify(ALLOWED_TOPICS)}
        
        YOUR TASKS:
        1. Identify the Topic from the list above.
        2. Identify the Difficulty (Easy, Medium, Hard).
        3. Return a JSON object.

        OUTPUT FORMAT (JSON ONLY):
        {
          "classifications": {
            "Problem Name": { "topic": "Topic", "difficulty": "Easy" }
          }
        }
      `;

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Classify these problems:\n${JSON.stringify(batchNames)}` }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });
      return JSON.parse(completion.choices[0].message.content).classifications;
    } catch (e) {
      console.error("Batch failed:", e.message);
      return {};
    }
  };

  try {
    // Run batches in parallel (Limit concurrency if needed, but Promise.all is fine for <50 batches)
    const results = await Promise.all(chunks.map(chunk => processBatch(chunk)));

    // Merge Results
    const mergedClassifications = {};
    results.forEach(res => Object.assign(mergedClassifications, res));

    // Re-hydrate with merged sources
    const finalProblems = problemNames.map(name => {
      const data = problemMap.get(name);
      const aiClass = mergedClassifications[name] || {};

      // Get Raw Topic (from AI or CSV)
      let rawTopic = (aiClass.topic && aiClass.topic !== "Uncategorized") ? aiClass.topic : data.topic;

      // NORMALIZE TOPIC to Standard List
      const finalTopic = normalizeTopic(rawTopic);

      // Prefer AI difficulty if valid, otherwise use CSV difficulty
      const finalDiff = (aiClass.difficulty) ? aiClass.difficulty : data.difficulty;

      return {
        name: name,
        link: data.link,
        source: Array.from(data.sources).join(', '),
        topic: finalTopic,
        difficulty: finalDiff
      };
    });

    // Recalculate Summary based on Normalized Topics
    const summary = {};
    finalProblems.forEach(p => {
      if (!summary[p.topic]) summary[p.topic] = { easy: 0, medium: 0, hard: 0 };
      const diff = p.difficulty.toLowerCase();
      if (summary[p.topic][diff] !== undefined) summary[p.topic][diff]++;
    });

    return {
      summary: summary,
      problems: finalProblems
    };

  } catch (error) {
    console.error('❌ Groq API Error:', error);
    console.error('Stack:', error.stack);

    // Fallback Mock Data (Normalized)
    return {
      summary: {
        "Arrays": { easy: 5, medium: 8, hard: 2 },
        "Dynamic Programming (DP)": { easy: 2, medium: 12, hard: 5 }
      },
      problems: [],
      message: "Generated via Mock Fallback (Groq API failed)"
    };
  }
}

// NEW: Process a small batch of problems (called by frontend loop)
async function processBatchWithGroq(problems) {
  // Use Index as ID to ensure perfect mapping back
  const problemDetails = problems.map((p, index) => `ID: ${index} | Name: ${p.name} | Link: ${p.link}`);

  const systemPrompt = `
    You are an expert DSA Study Planner.
    Classify the given problems into EXACTLY one of these topics:
    ${JSON.stringify(ALLOWED_TOPICS)}
    
    YOUR TASKS:
    1. Analyze each problem using its Name and Link.
    2. Identify the Topic from the list above.
    3. Identify the Difficulty (Easy, Medium, Hard). Use your knowledge of LeetCode problems. Do NOT default to Medium; guess Easy or Hard if appropriate.
    4. Provide the LeetCode URL if the original link is missing or invalid.
    5. Return a JSON object where keys are the IDs provided.

    OUTPUT FORMAT (JSON ONLY):
    {
      "classifications": {
        "0": { "topic": "Topic", "difficulty": "Easy", "link": "https://leetcode.com/problems/..." },
        "1": { "topic": "Topic", "difficulty": "Medium", "link": "..." }
      }
    }
  `;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Classify these problems:\n${JSON.stringify(problemDetails)}` }
      ],
      model: 'llama-3.3-70b-versatile', // Smarter model
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    console.log("🤖 AI Raw Response:", completion.choices[0].message.content.substring(0, 200) + "..."); // Log first 200 chars
    const result = JSON.parse(completion.choices[0].message.content);
    const classifications = result.classifications || {};

    // Merge AI results with original data using Index
    return problems.map((p, index) => {
      const aiClass = classifications[index.toString()] || {};

      let rawTopic = (aiClass.topic && aiClass.topic !== "Uncategorized") ? aiClass.topic : p.topic;
      const finalTopic = normalizeTopic(rawTopic);

      const finalDiff = (aiClass.difficulty) ? aiClass.difficulty : p.difficulty;

      // Use AI link if original is missing
      const finalLink = (p.link && p.link.length > 5) ? p.link : (aiClass.link || "");

      return {
        ...p,
        topic: finalTopic,
        difficulty: finalDiff,
        link: finalLink
      };
    });

  } catch (error) {
    console.error('Batch AI Error:', error.message);
    // Fallback: Return original with normalized topic
    return problems.map(p => ({
      ...p,
      topic: normalizeTopic(p.topic),
      difficulty: p.difficulty
    }));
  }
}

module.exports = { processWithGroq, processBatchWithGroq };
