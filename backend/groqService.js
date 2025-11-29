const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || 'gsk_placeholder_key'
});

async function processWithGroq(rawData) {
  // 1. Pre-process data
  let allProblems = [];
  rawData.forEach(file => {
    file.content.forEach(row => {
      const values = Object.values(row);
      // Heuristic to find name and link
      const name = values.find(v => v && v.length < 100 && !v.startsWith('http') && !/^\d+$/.test(v));
      const link = values.find(v => v && v.startsWith('http'));

      if (name) {
        allProblems.push(`Name: ${name} | Link: ${link || 'N/A'} | Source: ${file.filename}`);
      }
    });
  });

  // Limit to avoid token limits (in prod, use batching)
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

    const result = JSON.parse(completion.choices[0].message.content);
    return result;

  } catch (error) {
    console.error('Groq API Error:', error.message);
    // Fallback Mock Data matching the new structure
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

module.exports = { processWithGroq };
