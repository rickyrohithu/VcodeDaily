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

function cleanRawData(rawData) {
  const problemMap = new Map(); // Name -> { link, sources: Set }

  rawData.forEach(file => {
    // STRICTLY Clean filename: remove .csv, .xlsx, .xls (case insensitive)
    let cleanSource = file.filename.replace(/\.(csv|xlsx|xls)$/i, '').trim();

    file.content.forEach(rawRow => {
      // Ensure row is an array of values
      const row = Array.isArray(rawRow) ? rawRow : Object.values(rawRow);

      // 1. Identify Link (First HTTP string)
      const link = row.find(v => v && typeof v === 'string' && v.includes('http')) || '';

      // 2. Identify Name (Longest string that isn't a URL and isn't a pure number)
      // We filter out common short words like "Easy", "Medium", "Hard", "Done", "Yes", "No" to avoid false positives
      const candidates = row.filter(v =>
        v &&
        typeof v === 'string' &&
        !v.includes('http') &&
        !v.match(/^\d+$/) &&
        v.length > 2 && // Ignore very short strings
        !['easy', 'medium', 'hard', 'done', 'pending', 'yes', 'no'].includes(v.toLowerCase())
      );

      // Sort by length descending
      candidates.sort((a, b) => b.length - a.length);
      const name = candidates.length > 0 ? candidates[0] : null;

      // 3. Identify Topic (Any other string that looks like a topic)
      // We look for known keywords in the remaining candidates
      let potentialTopic = "Uncategorized";
      for (const c of candidates) {
        if (c === name) continue; // Skip the name
        const normalized = normalizeTopic(c);
        if (normalized !== "Uncategorized") {
          potentialTopic = normalized; // Found a valid topic column
          break;
        }
      }

      // 4. Identify Difficulty
      const difficulty = row.find(v => v && typeof v === 'string' && v.match(/^(Easy|Medium|Hard)$/i)) || "Medium";

      if (name && link) { // Only accept if both Name and Link exist
        const cleanName = name.trim();
        if (!problemMap.has(cleanName)) {
          problemMap.set(cleanName, {
            link,
            sources: new Set(),
            topic: potentialTopic,
            difficulty: difficulty
          });
        }
        problemMap.get(cleanName).sources.add(cleanSource);

        // Prefer "Uncategorized" topic update if we found a better one
        if (potentialTopic !== "Uncategorized" && problemMap.get(cleanName).topic === "Uncategorized") {
          problemMap.get(cleanName).topic = potentialTopic;
        }
      }
    });
  });

  const uniqueProblems = Array.from(problemMap.keys());

  // Limit to 1000 unique problems
  const problemNames = uniqueProblems.slice(0, 1000);

  return problemNames.map(name => {
    const data = problemMap.get(name);
    return {
      name: name,
      link: data.link,
      source: Array.from(data.sources).join(', '),
      topic: normalizeTopic(data.topic), // Initial normalization
      difficulty: data.difficulty
    };
  });
}

async function processWithGroq(rawData) {
  // DEPRECATED: Use cleanRawData + client-side batching instead
  const problems = cleanRawData(rawData);
  // ... (rest of logic if needed, but we are moving to batching)
  return { summary: {}, problems };
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

module.exports = { processWithGroq, processBatchWithGroq, cleanRawData };
