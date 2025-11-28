// script.js
const MAX_SHEETS = 10;
const API_URL = 'http://localhost:3000/api/upload';

const sheetInputsDiv = document.getElementById('sheetInputs');
const addSheetBtn = document.getElementById('addSheetBtn');
const downloadBtn = document.getElementById('downloadBtn');
const uploadBtn = document.getElementById('uploadBtn');
const analyseBtn = document.getElementById('analyseBtn');

let sheetCount = 0;
let selectedFiles = []; // Store selected files here

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
  nameField.value = 'Striver Sheet';
  sheetInputsDiv.appendChild(row);
  sheetCount = 1;
  updateAddButtonState();
}
initDefaultSheet();

// CSV download (Mock)
function downloadAllCSVs() {
  const rows = sheetInputsDiv.querySelectorAll('.sheet-row');
  rows.forEach(row => {
    const name = row.querySelector('input[type=text]').value.trim();
    const url = row.querySelector('input[type=url]').value.trim();
    if (!name) return;
    const csvContent = `Sheet Name,URL\n"${name}","${url}"`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const fileName = `${name.toLowerCase().replace(/\s+/g, '-')}.csv`;
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
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

// Analyse: Send files to Backend
analyseBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) {
    alert('Please upload at least one CSV file first.');
    return;
  }

  analyseBtn.textContent = 'Processing...';
  analyseBtn.disabled = true;

  const formData = new FormData();
  selectedFiles.forEach(file => {
    formData.append('files', file);
  });

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const result = await response.json();
    console.log('Backend Response:', result);

    // Render Results
    const summary = result.data.summary;
    const topicGrid = document.getElementById('topicSummary');
    topicGrid.innerHTML = ''; // Clear previous

    if (summary) {
      Object.entries(summary).forEach(([topic, counts]) => {
        const card = document.createElement('div');
        card.className = 'topic-card';
        card.innerHTML = `
          <div class="topic-header">
            <span class="topic-name">${topic}</span>
            <div class="topic-stats">
              <span class="stat-badge" style="color:#4ade80">E: ${counts.easy || 0}</span>
              <span class="stat-badge" style="color:#fbbf24">M: ${counts.medium || 0}</span>
              <span class="stat-badge" style="color:#f87171">H: ${counts.hard || 0}</span>
            </div>
          </div>
          <div class="days-input-group">
            <label>Days to study:</label>
            <input type="number" min="1" value="3" class="topic-days-input" data-topic="${topic}">
          </div>
        `;
        topicGrid.appendChild(card);
      });

      document.getElementById('resultsSection').style.display = 'block';
      // Scroll to results
      document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
    } else {
      alert('No topic summary returned.');
    }

  } catch (error) {
    console.error('Error:', error);
    alert('An error occurred while processing the files.');
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

  // Collect days per topic
  const topicDays = {};
  document.querySelectorAll('.topic-days-input').forEach(input => {
    topicDays[input.dataset.topic] = parseInt(input.value) || 3;
  });

  try {
    const response = await fetch('http://localhost:3000/api/generate-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicDays, problems: [] }) // Sending empty problems for mock
    });

    const result = await response.json();
    console.log('Schedule:', result);

    renderSchedule(result.schedule);

  } catch (error) {
    console.error('Error:', error);
    alert('Failed to generate schedule.');
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

  schedule.forEach(day => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <div class="day-marker">Day ${day.day}</div>
      <div class="day-content">
        <div class="day-topic">${day.topic}</div>
        <ul class="day-problems">
          ${day.problems.map(p => `
            <li class="problem-item">
              <div class="problem-main">
                <span class="problem-name">${p.name}</span>
                <span class="problem-diff ${p.difficulty.toLowerCase()}">${p.difficulty}</span>
              </div>
              <div class="problem-source">Source: ${p.source}</div>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
    timeline.appendChild(item);
  });

  scheduleDiv.scrollIntoView({ behavior: 'smooth' });
}
