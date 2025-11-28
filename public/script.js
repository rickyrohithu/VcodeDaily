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

// Analyse Sheets (Client-Side Batching)
analyseBtn.addEventListener('click', async () => {
  const fileInput = document.getElementById('sheetInput');
  if (!fileInput.files.length) {
    alert('Please select a file first.');
    return;
  }

  analyseBtn.textContent = 'Parsing CSV...';
  analyseBtn.disabled = true;

  try {
    // 1. Parse CSV (Fast)
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const parseResponse = await fetch('/api/parse-csv', {
      method: 'POST',
      body: formData
    });

    if (!parseResponse.ok) throw new Error('Failed to parse CSV');
    const parseResult = await parseResponse.json();
    const rawProblems = parseResult.problems;

    if (!rawProblems || rawProblems.length === 0) {
      throw new Error('No valid problems found in CSV.');
    }

    console.log(`Parsed ${rawProblems.length} problems. Starting Batch Analysis...`);
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
          analyzedProblems = analyzedProblems.concat(chunk); // Fallback
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
    const summary = {};
    currentProblems.forEach(p => {
      const topic = p.topic || "Uncategorized";
      if (!summary[topic]) summary[topic] = { easy: 0, medium: 0, hard: 0 };
      const diff = (p.difficulty || "Medium").toLowerCase();
      if (summary[topic][diff] !== undefined) summary[topic][diff]++;
    });

    // Render Dashboard
    const topicGrid = document.querySelector('.topic-grid');
    topicGrid.innerHTML = ''; // Clear previous

    Object.keys(summary).forEach(topic => {
      const counts = summary[topic];
      const total = counts.easy + counts.medium + counts.hard;

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
      throw new Error(result.error || 'Schedule generation failed');
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
