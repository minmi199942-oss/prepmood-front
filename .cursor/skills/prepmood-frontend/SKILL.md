---
name: prepmood-frontend
description: Frontend best practices for Prepmood project (pure HTML/JavaScript, no frameworks). Use when writing client-side code, handling user input, making API calls, or manipulating the DOM. Applies XSS prevention, API patterns, and event handling rules.
---

# Prepmood Frontend Best Practices

## Security (XSS Prevention)

### Always Escape User Input
```javascript
// ✅ Correct: Use escapeHtml for all user input
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

resultCard.innerHTML = `<p>${escapeHtml(userInput)}</p>`;

// ❌ Wrong: Direct insertion
resultCard.innerHTML = `<p>${userInput}</p>`;
```

### Use textContent for Plain Text
```javascript
// ✅ Correct: textContent for plain text
element.textContent = userInput;

// ❌ Wrong: innerHTML for plain text
element.innerHTML = userInput;
```

## API Calls

### Standard Pattern (async/await)
```javascript
// ✅ Correct: async/await + error handling
async function fetchData() {
  try {
    const response = await fetch(`${API_BASE}/endpoint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include', // JWT 쿠키 전송
      body: JSON.stringify({ data })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || '요청 실패');
    }
    
    return data;
  } catch (error) {
    Logger.error('API 호출 실패', { error: error.message });
    throw error;
  }
}

// ❌ Wrong: Promise.then() chaining
function fetchData() {
  return fetch(`${API_BASE}/endpoint`)
    .then(response => response.json())
    .then(data => data)
    .catch(err => console.error(err));
}
```

### Always Include credentials: 'include'
```javascript
// ✅ Correct: Send JWT cookie
const response = await fetch(`${API_BASE}/endpoint`, {
  credentials: 'include'
});

// ❌ Wrong: No credentials (JWT not sent)
const response = await fetch(`${API_BASE}/endpoint`);
```

## DOM Manipulation

### Use addEventListener (not inline)
```javascript
// ✅ Correct: addEventListener
const button = document.getElementById('submit-btn');
button.addEventListener('click', handleSubmit);

// ❌ Wrong: Inline event handler
<button onclick="handleSubmit()">Submit</button>
```

### Event Delegation for Dynamic Elements
```javascript
// ✅ Correct: Event delegation
document.getElementById('list').addEventListener('click', (e) => {
  if (e.target.classList.contains('delete-btn')) {
    handleDelete(e.target.dataset.id);
  }
});

// ❌ Wrong: Attach to each element
document.querySelectorAll('.delete-btn').forEach(btn => {
  btn.addEventListener('click', handleDelete);
});
```

## Error Handling

### User-Friendly Messages
```javascript
// ✅ Correct: User-friendly + logging
try {
  const result = await someOperation();
  alert('작업이 완료되었습니다.');
} catch (error) {
  Logger.error('작업 실패', { error: error.message });
  alert('서버 오류가 발생했습니다. 나중에 다시 시도해주세요.');
}

// ❌ Wrong: Show raw error to user
catch (error) {
  alert(error.message);
}
```

### Validate Before Submit
```javascript
// ✅ Correct: Validate first
function handleSubmit() {
  const email = document.getElementById('email').value.trim();
  
  if (!email) {
    showError('이메일을 입력해주세요.');
    return;
  }
  
  if (!isValidEmail(email)) {
    showError('올바른 이메일 형식이 아닙니다.');
    return;
  }
  
  submitForm(email);
}

// ❌ Wrong: No validation
function handleSubmit() {
  const email = document.getElementById('email').value;
  submitForm(email);
}
```

## Utility Functions

### Use Project Utils
```javascript
// Available utilities (from utils.js):

// XSS prevention
escapeHtml(text)

// Price formatting
formatPrice(price)  // → "₩1,000"

// URL parameters
getUrlParameter('id')

// Logging
Logger.log('message', { data })
Logger.error('error', { error: error.message })
Logger.warn('warning', { data })
```

## Async Patterns

### Use async/await (not .then)
```javascript
// ✅ Correct: async/await
async function loadData() {
  try {
    const data = await fetchData();
    renderData(data);
  } catch (error) {
    showError('데이터를 불러올 수 없습니다.');
  }
}

// ❌ Wrong: .then chaining
function loadData() {
  fetchData()
    .then(data => renderData(data))
    .catch(err => showError('데이터를 불러올 수 없습니다.'));
}
```

### Wait for DOM Ready
```javascript
// ✅ Correct: Wait for DOM
document.addEventListener('DOMContentLoaded', init);

function init() {
  // DOM manipulation here
}

// ❌ Wrong: Run immediately
const button = document.getElementById('submit-btn');
button.addEventListener('click', handleSubmit);
```

## Code Style

### Use const/let (never var)
```javascript
// ✅ Correct
const API_BASE = window.API_BASE || '/api';
let currentUser = null;

// ❌ Wrong
var API_BASE = '/api';
var currentUser = null;
```

### Function Naming (camelCase)
```javascript
// ✅ Correct
async function getUserEmail() { ... }
function handleButtonClick() { ... }

// ❌ Wrong
async function GetUserEmail() { ... }
function handle_button_click() { ... }
```

### Constants (UPPER_SNAKE_CASE)
```javascript
// ✅ Correct
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const API_BASE_URL = '/api';

// ❌ Wrong
const maxFileSize = 5 * 1024 * 1024;
const apiBaseUrl = '/api';
```

## Project-Specific Patterns

### API Base URL
```javascript
// ✅ Correct: Use window.API_BASE or fallback
const API_BASE = window.API_BASE
  ? window.API_BASE
  : (window.location.origin.replace(/\/$/, '') + '/api');

// ❌ Wrong: Hardcoded
const API_BASE = 'http://localhost:3000/api';
```

### User Email from JWT
```javascript
// ✅ Correct: Get from /api/auth/me
async function getUserEmail() {
  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include'
    });
    
    if (response.status === 401) {
      return null;
    }
    
    const data = await response.json();
    return data.success && data.user ? data.user.email : null;
  } catch (error) {
    Logger.error('getUserEmail 실패', { error: error.message });
    return null;
  }
}

// ❌ Wrong: Stored in localStorage
const userEmail = localStorage.getItem('userEmail');
```

### Login Check
```javascript
// ✅ Correct: Check via API
async function isLoggedIn() {
  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include'
    });
    
    if (response.status === 401) {
      return false;
    }
    
    const data = await response.json();
    return data.success && data.user;
  } catch (error) {
    return false;
  }
}

// ❌ Wrong: Check localStorage token
const isLoggedIn = !!localStorage.getItem('token');
```

## Form Handling

### Standard Form Submit Pattern
```javascript
// ✅ Correct: Prevent default + validate + submit
document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Clear previous errors
  clearErrors();
  
  // Validate
  const email = document.getElementById('email').value.trim();
  if (!email) {
    showError('email-error', '이메일을 입력해주세요.');
    return;
  }
  
  // Submit
  try {
    const result = await submitForm({ email });
    alert('제출되었습니다.');
    window.location.href = '/success.html';
  } catch (error) {
    showError('form-error', '제출에 실패했습니다.');
  }
});
```

### Show/Hide Error Messages
```javascript
// ✅ Correct: Helper functions
function showError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
}

function clearErrors() {
  document.querySelectorAll('.error-message').forEach(el => {
    el.style.display = 'none';
    el.textContent = '';
  });
}
```

## Loading States

### Show/Hide Loading Indicator
```javascript
// ✅ Correct: Loading state management
async function fetchData() {
  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');
  
  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';
  
  try {
    const data = await fetch(`${API_BASE}/data`, {
      credentials: 'include'
    }).then(r => r.json());
    
    renderData(data);
    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
  } catch (error) {
    loadingEl.style.display = 'none';
    showError('데이터를 불러올 수 없습니다.');
  }
}
```

## Forbidden Patterns

### Never Store JWT in localStorage
```javascript
// ❌ FORBIDDEN: JWT in localStorage (XSS risk)
localStorage.setItem('token', jwt);

// ✅ Correct: JWT in httpOnly cookie (server-side only)
// Cookie is set by server, not client JavaScript
```

### Never Use innerHTML with User Input
```javascript
// ❌ FORBIDDEN: XSS vulnerability
element.innerHTML = userInput;

// ✅ Correct: Escape first
element.innerHTML = escapeHtml(userInput);

// ✅ Better: Use textContent for plain text
element.textContent = userInput;
```

### Never Use eval()
```javascript
// ❌ FORBIDDEN: Security risk
eval(userInput);

// ✅ Correct: Parse safely
try {
  const data = JSON.parse(userInput);
} catch (error) {
  showError('잘못된 형식입니다.');
}
```

## Performance Optimization

### Batch DOM CSS Changes (Impact: MEDIUM)
```javascript
// ❌ Wrong: Multiple reflows
function updateElementStyles(element) {
  element.style.width = '100px';
  element.style.height = '200px';
  element.style.backgroundColor = 'blue';
  element.style.border = '1px solid black';
}

// ✅ Correct: Use class (single reflow)
// CSS: .highlighted-box { width: 100px; height: 200px; ... }
function updateElementStyles(element) {
  element.classList.add('highlighted-box');
}

// ✅ Correct: Use cssText (single reflow)
function updateElementStyles(element) {
  element.style.cssText = `
    width: 100px;
    height: 200px;
    background-color: blue;
    border: 1px solid black;
  `;
}
```

### Cache localStorage Reads (Impact: LOW-MEDIUM)
```javascript
// ❌ Wrong: Reads storage on every call
function getTheme() {
  return localStorage.getItem('theme') ?? 'light';
}
// Called 10 times = 10 storage reads

// ✅ Correct: Cache with Map
const storageCache = new Map();

function getLocalStorage(key) {
  if (!storageCache.has(key)) {
    storageCache.set(key, localStorage.getItem(key));
  }
  return storageCache.get(key);
}

function setLocalStorage(key, value) {
  localStorage.setItem(key, value);
  storageCache.set(key, value);  // Keep cache in sync
}

// Invalidate on tab focus (external changes)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    storageCache.clear();
  }
});
```

### Hoist RegExp Creation (Impact: LOW-MEDIUM)
```javascript
// ❌ Wrong: New RegExp every call
function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;  // Created every time
  return regex.test(email);
}

// ✅ Correct: Hoist to module level
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email) {
  return EMAIL_REGEX.test(email);
}

// ⚠️ Warning: Global regex (/g) has mutable lastIndex
const globalRegex = /foo/g;
globalRegex.test('foo');  // true, lastIndex = 3
globalRegex.test('foo');  // false, lastIndex = 0
```

### Early Return (Impact: LOW-MEDIUM)
```javascript
// ❌ Wrong: Continues after finding error
function validateForm(fields) {
  let hasError = false;
  let errorMessage = '';
  
  for (const field of fields) {
    if (!field.value) {
      hasError = true;
      errorMessage = `${field.name} is required`;
    }
  }
  
  return { valid: !hasError, error: errorMessage };
}

// ✅ Correct: Return immediately
function validateForm(fields) {
  for (const field of fields) {
    if (!field.value) {
      return { valid: false, error: `${field.name} is required` };
    }
  }
  return { valid: true };
}
```

### Use Set for O(1) Lookups (Impact: LOW-MEDIUM)
```javascript
// ❌ Wrong: O(n) per check
const validStatuses = ['pending', 'active', 'completed'];
if (validStatuses.includes(status)) { ... }

// ✅ Correct: O(1) per check
const validStatuses = new Set(['pending', 'active', 'completed']);
if (validStatuses.has(status)) { ... }
```

### Cache Property Access in Loops (Impact: LOW-MEDIUM)
```javascript
// ❌ Wrong: Multiple property lookups per iteration
for (let i = 0; i < items.length; i++) {
  render(config.theme.colors.primary);
}

// ✅ Correct: Cache before loop
const primaryColor = config.theme.colors.primary;
const len = items.length;
for (let i = 0; i < len; i++) {
  render(primaryColor);
}
```

### Combine Multiple Array Iterations (Impact: LOW-MEDIUM)
```javascript
// ❌ Wrong: 3 separate iterations
const visible = items.filter(i => i.visible);
const enabled = items.filter(i => i.enabled);
const selected = items.filter(i => i.selected);

// ✅ Correct: 1 iteration
const visible = [];
const enabled = [];
const selected = [];

for (const item of items) {
  if (item.visible) visible.push(item);
  if (item.enabled) enabled.push(item);
  if (item.selected) selected.push(item);
}
```

### Early Length Check for Comparisons (Impact: MEDIUM-HIGH)
```javascript
// ❌ Wrong: Always compares all items
function areArraysEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ✅ Correct: Check length first
function areArraysEqual(a, b) {
  if (a.length !== b.length) return false;
  
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
```

## References

- `utils.js`: Utility functions (escapeHtml, formatPrice, Logger)
- `global.css`: Global styles
- `page.css`: Page-specific styles
