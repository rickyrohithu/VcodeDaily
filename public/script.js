// script.js
const MAX_SHEETS = 10;
// Use full URL for local testing (change to /api/upload for Vercel)
const API_URL = '/api/upload';

const sheetInputsDiv = document.getElementById('sheetInputs');
const addSheetBtn = document.getElementById('addSheetBtn');
const downloadBtn = document.getElementById('downloadBtn');
const uploadBtn = document.getElementById('uploadBtn');
const analyseBtn = document.getElementById('analyseBtn');

let sheetCount = 0;
let selectedFiles = []; // Store selected files here
let currentProblems = []; // Store analyzed problems

// ... (createSheetRow and addSheetBtn logic remains mostly the same, 
// but we might want to focus on file upload as per recent instructions. 
// I'll keep the URL logic for now as it was part of the previous requirement, 
// but I'll make the Analyse button prioritize uploaded files if present.)

function createSheetRow(index) {
  const wrapper = document.createElement('div');
  wrapper.className = 'sheet-row';
  // Inline styles removed; handled by CSS .sheet-row

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = `Sheet ${index + 1} Name`;
  nameInput.dataset.idx = index;
  nameInput.required = true;

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.placeholder = `Google Sheet URL`;
  urlInput.dataset.idx = index;
  urlInput.required = true;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.innerHTML = '&times;';
  removeBtn.title = 'Remove this sheet';
  removeBtn.onclick = () => {
    wrapper.remove();
    sheetCount--;
    updateAddButtonState();
  };

  wrapper.appendChild(nameInput);
  wrapper.appendChild(urlInput);
  wrapper.appendChild(removeBtn);
  return wrapper;
}

function updateAddButtonState() {
  addSheetBtn.disabled = sheetCount >= MAX_SHEETS;
}

addSheetBtn.addEventListener('click', () => {
  if (sheetCount >= MAX_SHEETS) return;
  const row = createSheetRow(sheetCount);
  sheetInputsDiv.appendChild(row);
  sheetCount++;
  updateAddButtonState();
});

function initDefaultSheet() {
  const row = createSheetRow(0);
  const nameField = row.querySelector('input[type=text]');
  // nameField.value = 'Striver Sheet'; // Removed pre-filling
  sheetInputsDiv.appendChild(row);
  sheetCount = 1;
  updateAddButtonState();
}
initDefaultSheet();

// CSV download – Fetches real data from Google Sheets
async function downloadAllCSVs() {
  const rows = document.querySelectorAll('.sheet-row'); // Select all current rows
  console.log(`Found ${rows.length} sheets to download.`);

  for (const row of rows) {
    const nameInput = row.querySelector('input[type="text"]');
    const urlInput = row.querySelector('input[type="url"]');

    if (!nameInput || !urlInput) continue;

    const name = nameInput.value.trim();
    const url = urlInput.value.trim();

    if (!name || !url) {
      console.warn('Skipping empty row');
      continue;
    }

    try {
      // Extract Sheet ID
      const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) {
        alert(`Invalid Google Sheet URL for "${name}". Please check the link.`);
        continue;
      }
      const sheetId = match[1];
      const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

      console.log(`Downloading ${name}...`);

      // Fetch the CSV data
      const response = await fetch(exportUrl);
      if (!response.ok) throw new Error('Failed to fetch sheet (Check if Public)');

      const csvBlob = await response.blob();

      // Trigger Download
      const link = document.createElement('a');
      const fileName = `${name.toLowerCase().replace(/\s+/g, '-')}.csv`;
      link.href = URL.createObjectURL(csvBlob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Add a small delay to ensure multiple downloads work
      await new Promise(r => setTimeout(r, 1000));

    } catch (error) {
      console.error(`Error downloading ${name}:`, error);
      alert(`Could not download "${name}".\nMake sure the Google Sheet is Public (Anyone with the link can view).`);
    }
  }
}
downloadBtn.addEventListener('click', downloadAllCSVs);

// Handle File Selection
function handleUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.multiple = true;
  input.onchange = () => {
    const files = Array.from(input.files).slice(0, MAX_SHEETS);
    if (files.length === 0) return;

    selectedFiles = files; // Store for sending later

    const preview = document.createElement('div');
    preview.style.marginTop = '1rem';
    preview.innerHTML = '<strong>Selected CSVs:</strong><ul></ul>';
    const ul = preview.querySelector('ul');
    files.forEach(f => {
      const li = document.createElement('li');
      li.textContent = f.name;
      ul.appendChild(li);
    });

    const old = document.querySelector('.upload-preview');
    if (old) old.remove();
    preview.className = 'upload-preview';
    document.body.appendChild(preview);
  };
  input.click();
}
uploadBtn.addEventListener('click', handleUpload);

// Analyse Sheets (Client-Side Parsing & Batching)
analyseBtn.addEventListener('click', async () => {
  if (!selectedFiles || selectedFiles.length === 0) {
    alert('Please upload a CSV/Excel file first.');
    return;
  }

  analyseBtn.textContent = 'Reading File...';
  analyseBtn.disabled = true;

  try {
    const file = selectedFiles[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Array of arrays

        console.log(`Parsed ${jsonData.length} rows locally.`);

        // Helper to normalize topics locally
        const normalizeTopic = (input) => {
          if (!input) return "Uncategorized";
          const lower = input.toString().toLowerCase();
          if (lower.includes("array")) return "Arrays";
          if (lower.includes("string")) return "Strings";
          if (lower.includes("linked list")) return "Linked Lists";
          if (lower.includes("stack")) return "Stacks";
          if (lower.includes("queue") && !lower.includes("priority")) return "Queues";
          if (lower.includes("tree") || lower.includes("bst")) return "Trees";
          if (lower.includes("heap") || lower.includes("priority queue")) return "Heaps / Priority Queues";
          if (lower.includes("hash") || lower.includes("map")) return "Hashing";
          if (lower.includes("graph") || lower.includes("bfs") || lower.includes("dfs")) return "Graphs";
          if (lower.includes("dynamic") || lower.includes("dp")) return "Dynamic Programming (DP)";
          if (lower.includes("recursion") || lower.includes("backtrack")) return "Recursion & Backtracking";
          if (lower.includes("sort") || lower.includes("search")) return "Sorting & Searching";
          if (lower.includes("greedy")) return "Greedy Algorithms";
          return "Uncategorized";
        };

        // Filter Rows (Client-Side)
        const rawProblems = [];
        jsonData.forEach(row => {
          if (!row || row.length === 0) return;

          // Check for Link
          const hasLink = row.some(val => val && val.toString().includes('http'));
          if (!hasLink) return;

          // Extract Data
          const name = row.find(v => v && v.toString().length < 100 && !v.toString().includes('http') && !v.toString().match(/^\d+$/)) || "Unknown";
          const link = row.find(v => v && v.toString().includes('http')) || "";

          // Strict Topic Extraction
          let potentialTopic = row.find(v =>
            v &&
            v.toString() !== name &&
            v.toString() !== link &&
            v.toString().length < 30 &&
            !v.toString().match(/^(Easy|Medium|Hard)$/i) &&
            !v.toString().match(/^\d+$/) &&
            !v.toString().toLowerCase().includes('leetcode') && // Reject "LeetCode ..."
            !v.toString().toLowerCase().includes('problem')
          );

          // Normalize immediately
          let topic = normalizeTopic(potentialTopic);

          // If Uncategorized, try to guess from name, but DO NOT default to Arrays yet.
          // Let Groq AI handle it on the backend.
          if (topic === "Uncategorized") {
            topic = normalizeTopic(name);
          }

          const difficulty = row.find(v => v && v.toString().match(/^(Easy|Medium|Hard)$/i)) || "Medium";

          rawProblems.push({ name: name.trim(), link, topic, difficulty, source: file.name });
        });

        if (rawProblems.length === 0) {
          throw new Error('No valid problems found. Ensure your sheet has links (http/https).');
        }

        console.log(`Extracted ${rawProblems.length} valid problems. Starting Batch Analysis...`);
        analyseBtn.textContent = `Analyzing 0/${rawProblems.length}...`;

        // 2. Batch Analysis (Loop)
        const BATCH_SIZE = 20;
        let analyzedProblems = [];

        for (let i = 0; i < rawProblems.length; i += BATCH_SIZE) {
          const chunk = rawProblems.slice(i, i + BATCH_SIZE);

          try {
            const batchResponse = await fetch('/api/analyze-batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ problems: chunk })
            });

            if (batchResponse.ok) {
              const batchResult = await batchResponse.json();
              analyzedProblems = analyzedProblems.concat(batchResult.problems);
            } else {
              console.error('Batch failed, using raw data for this chunk');
              analyizedProblems = analyzedProblems.concat(chunk); // Fallback
            }

          } catch (e) {
            console.error('Batch network error', e);
            analyzedProblems = analyzedProblems.concat(chunk);
          }

          // Update Progress
          analyseBtn.textContent = `Analyzing ${Math.min(i + BATCH_SIZE, rawProblems.length)}/${rawProblems.length}...`;
        }

        currentProblems = analyzedProblems;
        console.log('Analysis Complete:', currentProblems);

        // 3. Calculate Summary & Render
        const STANDARD_TOPICS = [
          "Arrays", "Strings", "Linked Lists", "Stacks", "Queues",
          "Trees", "Heaps / Priority Queues", "Hashing", "Graphs",
          "Dynamic Programming (DP)", "Recursion & Backtracking",
          "Sorting & Searching", "Greedy Algorithms"
        ];

        const summary = {};
        // Initialize summary with 0s for strict ordering (optional, but good for structure)
        STANDARD_TOPICS.forEach(t => summary[t] = { easy: 0, medium: 0, hard: 0 });

        currentProblems.forEach(p => {
          let topic = p.topic || "Uncategorized";
          // Double-check normalization
          topic = normalizeTopic(topic);

          // If still Uncategorized, keep it as is so we can see it (or map to a 'Misc' if user prefers)
          // But for now, let's see what the AI actually returned.

          // Ensure topic exists in summary (if it's one of the 13, it will be. If not, add it dynamically?)
          // The user wants ONLY the 13 topics.
          // If it's Uncategorized, we have a problem. 
          // Let's force it to "Arrays" ONLY if it's truly unknown, but at least we warned.
          if (topic === "Uncategorized") {
            console.warn("Problem remained Uncategorized:", p.name);
            topic = "Arrays"; // Fallback for UI consistency, but at least we warned.
          }

          if (!summary[topic]) summary[topic] = { easy: 0, medium: 0, hard: 0 };

          const diff = (p.difficulty || "Medium").toLowerCase();
          if (summary[topic][diff] !== undefined) summary[topic][diff]++;
        });

        // Render Dashboard
        const topicGrid = document.querySelector('.topic-grid');
        topicGrid.innerHTML = ''; // Clear previous

        // Iterate through STANDARD_TOPICS to ensure correct order
        STANDARD_TOPICS.forEach(topic => {
          const counts = summary[topic];
          const total = counts.easy + counts.medium + counts.hard;

          // Only show if there are problems (or if you want to show empty categories, remove this check)
          if (total === 0) return;

          const card = document.createElement('div');
          card.className = 'topic-card';
          card.innerHTML = `
        <h3>${topic}</h3>
        <div class="topic-stats">
          <div class="stat-item">
            <span class="stat-value">${total}</span>
            <span class="stat-label">Problems</span>
          </div>
          <div class="difficulty-breakdown">
            <span class="stat-badge" style="color:#34d399">E: ${counts.easy}</span>
            <span class="stat-badge" style="color:#fbbf24">M: ${counts.medium}</span>
            <span class="stat-badge" style="color:#f87171">H: ${counts.hard}</span>
          </div>
        </div>
        <div class="days-input-group" style="display: flex; gap: 10px;">
            <div style="flex: 1;">
              <label>Days:</label>
              <input type="number" min="1" placeholder="3" value="" class="topic-days-input" data-topic="${topic}">
            </div>
            <div style="flex: 1;">
              <label>Order:</label>
              <input type="number" min="1" placeholder="1" class="topic-order-input" data-topic="${topic}">
            </div>
        </div>
      `;
          topicGrid.appendChild(card);
        });
        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });

      } catch (parseError) {
        console.error('Client-side parsing error:', parseError);
        alert('Failed to read file: ' + parseError.message);
      } finally {
        analyseBtn.textContent = 'Analyse Sheets';
        analyseBtn.disabled = false;
      }
    };

    reader.readAsArrayBuffer(file);

  } catch (error) {
    console.error('Error:', error);
    alert('An error occurred: ' + error.message);
    analyseBtn.textContent = 'Analyse Sheets';
    analyseBtn.disabled = false;
  }
});

// Generate Schedule
const generateBtn = document.getElementById('generateScheduleBtn');
generateBtn.addEventListener('click', async () => {
  generateBtn.textContent = 'Generating...';
  generateBtn.disabled = true;

  // Collect days and order per topic
  const topicDays = {};
  const topicOrder = {};

  document.querySelectorAll('.topic-days-input').forEach(input => {
    topicDays[input.dataset.topic] = parseInt(input.value) || 3;
  });

  document.querySelectorAll('.topic-order-input').forEach(input => {
    // Default to 999 if no order specified (put at end)
    topicOrder[input.dataset.topic] = parseInt(input.value) || 999;
  });

  // Get logged in user email
  const userEmail = localStorage.getItem('userEmail');

  try {
    const response = await fetch('/api/generate-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicDays,
        topicOrder, // Send the order
        problems: currentProblems,
        userEmail: userEmail
      })
    });

    const result = await response.json(); // Parse JSON once

    if (!response.ok) {
      // Now 'result' contains the error details
      // Check for Rate Limit message
      if (result.details && result.details.includes('Please try again in')) {
        const waitTime = result.details.match(/Please try again in (.*?)\./)[1];
        alert(`⚠️ AI Usage Limit Reached!\n\nPlease wait ${waitTime} before trying again.`);
        return;
      }
      const errorMsg = result.details || result.error || 'Schedule generation failed';
      throw new Error(result.stack ? `${errorMsg}\n\nStack: ${result.stack}` : errorMsg);
    }

    console.log('Schedule:', result);

    renderSchedule(result.schedule);

  } catch (error) {
    console.error('Error:', error);
    if (!error.message.includes('AI Usage Limit')) {
      alert('Failed to generate schedule: ' + error.message);
    }
  } finally {
    generateBtn.textContent = 'Generate Schedule';
    generateBtn.disabled = false;
  }
});

function renderSchedule(schedule) {
  // Create or clear schedule container
  let scheduleDiv = document.getElementById('scheduleSection');
  if (!scheduleDiv) {
    scheduleDiv = document.createElement('div');
    scheduleDiv.id = 'scheduleSection';
    scheduleDiv.className = 'results-section';
    scheduleDiv.innerHTML = '<h2>Your Study Plan</h2><div class="timeline"></div>';
    document.querySelector('.container').appendChild(scheduleDiv);
  }

  const timeline = scheduleDiv.querySelector('.timeline');
  timeline.innerHTML = ''; // Clear

  schedule.forEach((day, dIndex) => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <div class="day-marker">Day ${day.day}</div>
      <div class="day-content">
        <div class="day-topic">${day.topic}</div>
        
        <ul class="day-problems">
          ${day.problems.map((prob, pIndex) => `
            <li class="problem-item">
              <div class="problem-card">
                <div class="problem-row">
                  <!-- Checkbox -->
                  <div class="checkbox-wrapper">
                    <input type="checkbox" 
                           class="problem-checkbox" 
                           ${prob.completed ? 'checked' : ''} 
                           onchange="toggleProblem(${dIndex}, ${pIndex}, this.checked)">
                  </div>

                  <!-- Problem Details -->
                  <div class="problem-info">
                    <span class="problem-name ${prob.completed ? 'completed' : ''}">${prob.name}</span>
                    <span class="separator">—</span>
                    <span class="problem-difficulty badge-${prob.difficulty.toLowerCase()}">${prob.difficulty}</span>
                  </div>

                  <!-- LeetCode Link (Icon) -->
                  ${prob.link ? `
                    <a href="${prob.link}" target="_blank" class="leetcode-link" title="Solve on LeetCode">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/1/19/LeetCode_logo_black.png" alt="LeetCode" class="leetcode-icon" width="20" height="20">
                    </a>
                  ` : ''}
                </div>
                <!-- Source (Subtle) -->
                <div class="problem-source-subtle">${prob.source}</div>
              </div>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
    timeline.appendChild(item);
  });

  scheduleDiv.scrollIntoView({ behavior: 'smooth' });
}

// Toggle Problem Completion
async function toggleProblem(dayIndex, problemIndex, isChecked) {
  const userEmail = localStorage.getItem('userEmail');
  if (!userEmail) return;

  // Visual update immediately
  // Find the specific checkbox and update sibling text style
  // (Optional, but good UX)

  try {
    await fetch('/api/update-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        dayIndex,
        problemIndex,
        completed: isChecked
      })
    });
    console.log('Progress updated');
  } catch (error) {
    console.error('Failed to save progress', error);
    alert('Failed to save progress. Please check your connection.');
  }
}

// Listen for Auth Event
window.addEventListener('userLoggedIn', (e) => {
  console.log('Auth event received:', e.detail.email);
  loadExistingSchedule();
});

// Also check on load (in case auth finished before script loaded)
if (localStorage.getItem('userEmail')) {
  loadExistingSchedule();
}

// Check for existing schedule
async function loadExistingSchedule() {
  const userEmail = localStorage.getItem('userEmail');
  if (!userEmail) return;

  try {
    const response = await fetch(`/api/get-schedule?email=${userEmail}`);
    const data = await response.json();

    if (data.schedule) {
      console.log('Found existing schedule, rendering...');

      // 1. Hide Upload Section initially
      const uploadSection = document.querySelector('.sheet-section');
      const actionsDiv = document.querySelector('.actions');
      if (uploadSection) uploadSection.style.display = 'none';
      if (actionsDiv) actionsDiv.style.display = 'none';

      // 2. Show Results Section & Render
      const resultsSection = document.getElementById('resultsSection');
      resultsSection.style.display = 'block';
      renderSchedule(data.schedule);

      // 3. Add "Create New Schedule" Button below schedule
      // Check if button already exists to avoid duplicates
      if (!document.getElementById('createNewBtn')) {
        const newBtn = document.createElement('button');
        newBtn.id = 'createNewBtn';
        newBtn.className = 'btn-secondary';
        newBtn.innerText = 'Create New Schedule';
        newBtn.style.marginTop = '20px';
        newBtn.style.width = '100%';

        newBtn.onclick = () => {
          // Show Upload Section
          if (uploadSection) uploadSection.style.display = 'block';
          if (actionsDiv) actionsDiv.style.display = 'flex';
          // Scroll to it
          uploadSection.scrollIntoView({ behavior: 'smooth' });
          newBtn.remove(); // Remove button after clicking
        };

        // Append to container
        document.querySelector('.container').appendChild(newBtn);
      }
    }
  } catch (error) {
    console.error('Error loading schedule:', error);
  }
}
