// script.js
const MAX_SHEETS = 10;
// Use full URL for local testing (change to /api/upload for Vercel)
const API_URL = '/api/upload';

const sheetInputsDiv = document.getElementById('sheetInputs');
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

// Analyse Sheet (URL Based)
// Analyse Sheet (URL Based)
analyseBtn.addEventListener('click', async () => {
  const sheetUrl = document.getElementById('sheetUrl').value.trim();
  if (!sheetUrl) {
    alert('Please enter a Google Sheet URL.');
    return;
  }

  analyseBtn.textContent = 'Fetching...';
  analyseBtn.disabled = true;

  try {
    // 1. Fetch CSV content via Backend Proxy
    const response = await fetch('/api/proxy-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sheetUrl })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to fetch sheet');

    // 2. Parse CSV (Client-Side)
    // Result.data is base64 encoded string
    const workbook = XLSX.read(result.data, { type: 'base64' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Array of Arrays

    console.log(`Parsed ${jsonData.length} rows from URL.`);

    // Helper to normalize topics locally
    const normalizeTopic = (input) => {
      if (!input) return "Uncategorized";
      const lower = input.toString().toLowerCase();

      // Priority Mappings
      if (lower.includes("dp") || lower.includes("dynamic")) return "Dynamic Programming (DP)";
      if (lower.includes("tree") || lower.includes("bst") || lower.includes("trie")) return "Trees";
      if (lower.includes("graph") || lower.includes("bfs") || lower.includes("dfs") || lower.includes("union find")) return "Graphs";
      if (lower.includes("heap") || lower.includes("priority")) return "Heaps / Priority Queues";
      if (lower.includes("recursion") || lower.includes("backtrack")) return "Recursion & Backtracking";
      if (lower.includes("linked list")) return "Linked Lists";
      if (lower.includes("stack")) return "Stacks";
      if (lower.includes("queue")) return "Queues";
      if (lower.includes("hash") || lower.includes("map") || lower.includes("set")) return "Hashing";
      if (lower.includes("sort") || lower.includes("search") || lower.includes("binary search")) return "Sorting & Searching";
      if (lower.includes("greedy")) return "Greedy Algorithms";
      if (lower.includes("string")) return "Strings";
      if (lower.includes("array") || lower.includes("matrix") || lower.includes("vector")) return "Arrays";

      return "Uncategorized";
    };

    // Filter Rows (Client-Side)
    const rawProblems = [];
    jsonData.forEach(row => {
      if (!row || row.length === 0) return;

      // Check for Link
      const hasLink = row.some(val => val && val.toString().includes('http'));
      if (!hasLink) {
        // Even if no link, if it looks like a problem name, keep it?
        // User said "get leetcode problem links... during analyse".
        // So we should accept rows with just names too.
        const hasName = row.some(val => val && val.toString().length > 3 && !val.toString().match(/^\d+$/));
        if (!hasName) return;
      }

      // Extract Data
      const name = row.find(v => v && v.toString().length < 100 && !v.toString().includes('http') && !v.toString().match(/^\d+$/)) || "Unknown";
      const link = row.find(v => v && v.toString().includes('http')) || "";

      // Strict Topic Extraction
      let potentialTopic = row.find(v =>
        v &&
        v.toString() !== name &&
        v.toString() !== link &&
        v.toString().length < 40 &&
        !v.toString().match(/^(Easy|Medium|Hard)$/i) &&
        !v.toString().match(/^\d+$/) &&
        !v.toString().toLowerCase().includes('leetcode') &&
        !v.toString().toLowerCase().includes('problem')
      ) || "Uncategorized";

      // Normalize immediately
      let topic = normalizeTopic(potentialTopic);

      // If Uncategorized, try to guess from name
      if (topic === "Uncategorized") {
        topic = normalizeTopic(name);
      }

      // Robust Difficulty Extraction
      let difficulty = "Medium";
      const diffCell = row.find(v => v && v.toString().match(/(Easy|Medium|Hard)/i));
      if (diffCell) {
        const match = diffCell.toString().match(/(Easy|Medium|Hard)/i);
        if (match) difficulty = match[0];
        difficulty = difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase();
      }

      rawProblems.push({ name: name.trim(), link, topic, difficulty, source: "Google Sheet" });
    });

    if (rawProblems.length === 0) {
      alert('No valid problems found. Ensure your sheet has problem names.');
      return;
    }

    // 2. Batch Analysis (Send to Backend AI)
    analyseBtn.textContent = 'Analyzing with AI...';

    // Process in batches of 25
    const BATCH_SIZE = 25;
    currentProblems = []; // Reset global

    for (let i = 0; i < rawProblems.length; i += BATCH_SIZE) {
      const batch = rawProblems.slice(i, i + BATCH_SIZE);
      console.log(`Analyzing batch ${i / BATCH_SIZE + 1}...`);

      const batchRes = await fetch('/api/analyze-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problems: batch })
      });

      const batchData = await batchRes.json();
      if (batchData.problems) {
        currentProblems.push(...batchData.problems);
      }
    }

    console.log('Analysis Complete:', currentProblems);

    // 3. Calculate Summary & Render
    const STANDARD_TOPICS = [
      "Arrays", "Strings", "Linked Lists", "Stacks", "Queues",
      "Trees", "Heaps / Priority Queues", "Hashing", "Graphs",
      "Dynamic Programming (DP)", "Recursion & Backtracking",
      "Sorting & Searching", "Greedy Algorithms"
    ];

    const summary = {};
    STANDARD_TOPICS.forEach(t => summary[t] = { easy: 0, medium: 0, hard: 0 });

    currentProblems.forEach(p => {
      let topic = p.topic || "Uncategorized";
      topic = normalizeTopic(topic);

      if (topic === "Uncategorized") {
        console.warn("Problem remained Uncategorized:", p.name);
        topic = "Arrays"; // Fallback
      }

      if (!summary[topic]) summary[topic] = { easy: 0, medium: 0, hard: 0 };

      const diff = (p.difficulty || "Medium").toLowerCase();
      if (summary[topic][diff] !== undefined) summary[topic][diff]++;
    });

    // Render Dashboard
    const topicGrid = document.querySelector('.topic-grid');
    topicGrid.innerHTML = '';

    STANDARD_TOPICS.forEach(topic => {
      const counts = summary[topic];
      const total = counts.easy + counts.medium + counts.hard;

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

  } catch (error) {
    console.error('Error:', error);
    alert('An error occurred: ' + error.message);
  } finally {
    analyseBtn.textContent = 'Analyse Sheet';
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
