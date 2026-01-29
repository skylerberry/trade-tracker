// Trade Tracker App

const STORAGE_KEY = 'tradeTracker_trades';
const GIST_TOKEN_KEY = 'tradeTracker_gistToken';
const GIST_ID_KEY = 'tradeTracker_gistId';
const THEME_KEY = 'tradeTracker_theme';
const WATCHLIST_KEY = 'tradeTracker_watchlist';

// Trade status constants
const STATUS = {
    OPEN: 'open',
    PARTIALLY_CLOSED: 'partially_closed',
    CLOSED: 'closed',
    STOPPED_OUT: 'stopped_out'
};

const STATUS_LABELS = {
    [STATUS.OPEN]: 'Open',
    [STATUS.PARTIALLY_CLOSED]: 'Partial',
    [STATUS.CLOSED]: 'Closed',
    [STATUS.STOPPED_OUT]: 'Stopped'
};

// Theme Management
function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
        setTheme(saved);
    }
    // Listen for system theme changes (only applies if user hasn't set manual preference)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem(THEME_KEY)) {
            // No manual override, follow system
        }
    });

    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
}

// DOM Elements
const toggleFormBtn = document.getElementById('toggleFormBtn');
const tradeForm = document.getElementById('tradeForm');
const formTitle = document.getElementById('formTitle');
const cancelBtn = document.getElementById('cancelBtn');
const tradesBody = document.getElementById('tradesBody');
const noTradesMsg = document.getElementById('noTrades');
const statusFilter = document.getElementById('statusFilter');
const tradesTable = document.getElementById('tradesTable');

// State
let trades = [];
let editingId = null;
let datePickers = {};
let undoStack = [];
let saleCount = 0;
const MAX_UNDO = 50;
let watchlist = [];

// Flatpickr config
const flatpickrConfig = {
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'j M Y',
    allowInput: true,
    allowInvalidPreload: true,
    parseDate: (dateStr, format) => {
        // Only parse if it's a complete date string
        const parsed = Date.parse(dateStr);
        if (!isNaN(parsed)) {
            return new Date(parsed);
        }
        return null;
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await initGistSync();
    renderTrades();
    initDatePickers();

    // Copy Initial SL to Current SL button
    document.getElementById('copyInitialSL').addEventListener('click', () => {
        const currentSLField = document.getElementById('currentSL');
        const initialSL = document.getElementById('initialSL').value;
        if (initialSL) {
            saveToUndoStack(currentSLField);
            currentSLField.value = initialSL;
        }
    });

    // Track all form inputs for undo
    tradeForm.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('focus', () => saveToUndoStack(input));
    });

    // Cmd+Z / Ctrl+Z undo handler
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
            const lastUndo = undoStack.pop();
            if (lastUndo) {
                e.preventDefault();
                const element = document.getElementById(lastUndo.id);
                if (element) {
                    element.value = lastUndo.value;
                    // If it's a date picker, update flatpickr too
                    if (element.classList.contains('datepicker') && datePickers[lastUndo.id]) {
                        datePickers[lastUndo.id].setDate(lastUndo.value || null, false);
                    }
                }
            }
        }
    });
});

// Save field state to undo stack
function saveToUndoStack(element) {
    // Only save if it's different from the last saved state for this element
    const lastForElement = [...undoStack].reverse().find(u => u.id === element.id);
    if (!lastForElement || lastForElement.value !== element.value) {
        undoStack.push({ id: element.id, value: element.value });
        if (undoStack.length > MAX_UNDO) {
            undoStack.shift();
        }
    }
}

// Initialize Flatpickr date pickers
function initDatePickers() {
    const entryDateConfig = {
        ...flatpickrConfig,
        defaultDate: new Date(),
        onClose: function(selectedDates, dateStr, instance) {
            // Only set to today if user actually selected something, not on blur with partial input
            if (selectedDates.length === 0 && instance.input.value === '') {
                // Keep it empty if it was empty
            }
        }
    };

    datePickers.entryDate = flatpickr('#entryDate', entryDateConfig);
}

// Sales management
const salesContainer = document.getElementById('salesContainer');
const addSaleBtn = document.getElementById('addSaleBtn');

function addSale(saleData = null) {
    saleCount++;
    const saleId = saleCount;

    const saleRow = document.createElement('div');
    saleRow.className = 'sale-row';
    saleRow.dataset.saleId = saleId;

    saleRow.innerHTML = `
        <span class="sale-number">Sale ${saleId}</span>
        <div class="form-group">
            <div class="input-with-icon">
                <span class="input-icon">%</span>
                <select id="sale${saleId}Portion">
                    <option value="">Portion</option>
                    <option value="1/5">1/5</option>
                    <option value="1/4">1/4</option>
                    <option value="1/3">1/3</option>
                    <option value="1/2">1/2</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <div class="input-with-icon">
                <span class="input-icon">$</span>
                <input type="number" id="sale${saleId}Price" step="0.01" placeholder="Price">
            </div>
        </div>
        <div class="form-group">
            <div class="input-with-icon">
                <span class="input-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </span>
                <input type="text" id="sale${saleId}Date" class="datepicker" placeholder="Date">
            </div>
        </div>
        <button type="button" class="btn-remove-sale" onclick="removeSale(${saleId})">×</button>
    `;

    salesContainer.appendChild(saleRow);

    // Initialize flatpickr for the new date field
    datePickers[`sale${saleId}Date`] = flatpickr(`#sale${saleId}Date`, flatpickrConfig);

    // Set data if provided (for editing)
    if (saleData) {
        document.getElementById(`sale${saleId}Portion`).value = saleData.portion || '';
        if (saleData.price) document.getElementById(`sale${saleId}Price`).value = saleData.price;
        if (saleData.date) datePickers[`sale${saleId}Date`].setDate(saleData.date);
    }

    updateSaleNumbers();
}

function removeSale(saleId) {
    const saleRow = salesContainer.querySelector(`[data-sale-id="${saleId}"]`);
    if (saleRow) {
        // Destroy flatpickr instance
        if (datePickers[`sale${saleId}Date`]) {
            datePickers[`sale${saleId}Date`].destroy();
            delete datePickers[`sale${saleId}Date`];
        }
        saleRow.remove();
        updateSaleNumbers();
    }
}

function updateSaleNumbers() {
    const rows = salesContainer.querySelectorAll('.sale-row');
    rows.forEach((row, index) => {
        row.querySelector('.sale-number').textContent = `Sale ${index + 1}`;
    });
}

function getSalesData() {
    const sales = [];
    const rows = salesContainer.querySelectorAll('.sale-row');
    rows.forEach(row => {
        const saleId = row.dataset.saleId;
        const portion = document.getElementById(`sale${saleId}Portion`)?.value || '';
        const price = document.getElementById(`sale${saleId}Price`)?.value;
        const date = document.getElementById(`sale${saleId}Date`)?.value || null;

        // Only include sales that have at least a portion or price
        if (portion || price) {
            sales.push({
                portion,
                price: price ? parseFloat(price) : null,
                date
            });
        }
    });
    return sales;
}

function clearSales() {
    // Destroy all sale date pickers
    Object.keys(datePickers).forEach(key => {
        if (key.startsWith('sale') && key.endsWith('Date')) {
            datePickers[key].destroy();
            delete datePickers[key];
        }
    });
    salesContainer.innerHTML = '';
    saleCount = 0;
}

addSaleBtn.addEventListener('click', () => addSale());

// Export for onclick handlers
window.removeSale = removeSale;

// Event Listeners
toggleFormBtn.addEventListener('click', () => {
    tradeForm.classList.toggle('hidden');
    if (!tradeForm.classList.contains('hidden')) {
        toggleFormBtn.textContent = '- Hide Form';
        if (!editingId) {
            resetForm();
        }
    } else {
        toggleFormBtn.textContent = '+ Add New Trade';
        resetForm();
    }
});

cancelBtn.addEventListener('click', () => {
    tradeForm.classList.add('hidden');
    toggleFormBtn.textContent = '+ Add New Trade';
    resetForm();
});

tradeForm.addEventListener('submit', handleFormSubmit);
statusFilter.addEventListener('change', renderTrades);

// Load trades from localStorage
function loadTrades() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            trades = JSON.parse(stored);
        } catch (e) {
            console.error('Failed to parse trades from localStorage:', e);
            trades = [];
        }
    } else {
        trades = [];
    }
}

// Save trades to localStorage and sync to Gist
function saveTrades() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
    syncToGist();
}

// Validate trade form and show errors
function validateTradeForm() {
    const ticker = document.getElementById('ticker').value.trim();
    const entryPrice = parseFloat(document.getElementById('entryPrice').value);
    const initialSL = parseFloat(document.getElementById('initialSL').value);
    const currentSL = parseFloat(document.getElementById('currentSL').value);

    // Clear previous errors
    clearFormErrors();

    let isValid = true;

    if (!ticker) {
        showFormError('ticker', 'Ticker is required');
        isValid = false;
    }

    if (isNaN(entryPrice) || entryPrice <= 0) {
        showFormError('entryPrice', 'Entry price must be a positive number');
        isValid = false;
    }

    if (isNaN(initialSL) || initialSL <= 0) {
        showFormError('initialSL', 'Initial stop loss must be a positive number');
        isValid = false;
    } else if (initialSL >= entryPrice) {
        showFormError('initialSL', 'Stop loss must be below entry price');
        isValid = false;
    }

    if (isNaN(currentSL) || currentSL <= 0) {
        showFormError('currentSL', 'Current stop loss must be a positive number');
        isValid = false;
    }

    return isValid;
}

function showFormError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.classList.add('error');
        // Create error message element if it doesn't exist
        let errorEl = field.parentNode.querySelector('.form-error');
        if (!errorEl) {
            errorEl = document.createElement('span');
            errorEl.className = 'form-error';
            field.parentNode.appendChild(errorEl);
        }
        errorEl.textContent = message;
    }
}

function clearFormErrors() {
    document.querySelectorAll('#tradeForm .error').forEach(el => el.classList.remove('error'));
    document.querySelectorAll('#tradeForm .form-error').forEach(el => el.remove());
}

// Handle form submission
function handleFormSubmit(e) {
    e.preventDefault();

    if (!validateTradeForm()) {
        return;
    }

    const trade = {
        id: editingId || Date.now().toString(),
        ticker: document.getElementById('ticker').value.toUpperCase().trim(),
        entryPrice: parseFloat(document.getElementById('entryPrice').value),
        entryDate: document.getElementById('entryDate').value,
        initialSL: parseFloat(document.getElementById('initialSL').value),
        currentSL: parseFloat(document.getElementById('currentSL').value),
        status: document.getElementById('status').value,
        sales: getSalesData()
    };

    if (editingId) {
        const index = trades.findIndex(t => t.id === editingId);
        if (index !== -1) {
            trades[index] = trade;
        }
    } else {
        trades.push(trade);
    }

    saveTrades();
    renderTrades();

    tradeForm.classList.add('hidden');
    toggleFormBtn.textContent = '+ Add New Trade';
    resetForm();
}

// Reset form to default state
function resetForm() {
    tradeForm.reset();
    document.getElementById('tradeId').value = '';
    editingId = null;
    formTitle.textContent = 'Add New Trade';

    // Reset Flatpickr instances
    if (datePickers.entryDate) datePickers.entryDate.setDate(new Date());

    // Clear all sales
    clearSales();
}

// Format date for display (e.g., "25 Nov 2025")
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}

// Format short date for sale display (e.g., "Nov 25th")
function formatShortDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'short' });

    // Add ordinal suffix
    let suffix = 'th';
    if (day === 1 || day === 21 || day === 31) suffix = 'st';
    else if (day === 2 || day === 22) suffix = 'nd';
    else if (day === 3 || day === 23) suffix = 'rd';

    return `${month} ${day}${suffix}`;
}

// Format sale for display
function formatSale(sale, forHtml = true) {
    if (!sale || !sale.portion || !sale.price) {
        return forHtml ? '<span class="sale-empty">-</span>' : '-';
    }
    const dateStr = sale.date ? ` ${formatShortDate(sale.date)}` : '';
    return `${sale.portion} @ ${sale.price.toFixed(2)}${dateStr}`;
}

// Get sales array from trade (handles both new and legacy format)
function getTradeSales(trade) {
    if (trade.sales && trade.sales.length > 0) {
        return trade.sales;
    }
    // Legacy format: sale1, sale2, sale3
    const sales = [];
    if (trade.sale1) sales.push(trade.sale1);
    if (trade.sale2) sales.push(trade.sale2);
    if (trade.sale3) sales.push(trade.sale3);
    return sales;
}

// Format status for display
function formatStatus(status) {
    return `<span class="status-badge status-${status}">${STATUS_LABELS[status] || status}</span>`;
}

// Calculate current R-multiple for a trade
function calculateCurrentR(trade) {
    if (!trade.currentPrice || !trade.entryPrice || !trade.initialSL) return null;

    const riskPerShare = trade.entryPrice - trade.initialSL;
    if (riskPerShare <= 0) return null;

    const currentGain = trade.currentPrice - trade.entryPrice;
    return currentGain / riskPerShare;
}

// Format current R-multiple for display
function formatCurrentR(r) {
    if (r === null) return '-';
    const sign = r >= 0 ? '+' : '';
    return `${sign}${r.toFixed(1)}R`;
}

// Render trades table
function renderTrades() {
    const filter = statusFilter.value;
    let filteredTrades = trades;

    if (filter !== 'all') {
        filteredTrades = trades.filter(t => t.status === filter);
    }

    // Sort by entry date (newest first)
    filteredTrades.sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));

    if (filteredTrades.length === 0) {
        tradesTable.classList.add('hidden');
        noTradesMsg.classList.remove('hidden');
        noTradesMsg.textContent = filter === 'all'
            ? 'No trades logged yet. Click "Add New Trade" to get started.'
            : `No ${STATUS_LABELS[filter] || filter} trades found.`;
        return;
    }

    tradesTable.classList.remove('hidden');
    noTradesMsg.classList.add('hidden');

    tradesBody.innerHTML = filteredTrades.map(trade => {
        const sales = getTradeSales(trade);
        const currentR = calculateCurrentR(trade);
        return `
        <tr data-id="${trade.id}">
            <td><strong>${trade.ticker}</strong></td>
            <td>${trade.entryPrice.toFixed(2)}</td>
            <td>${formatDate(trade.entryDate)}</td>
            <td>${trade.initialSL.toFixed(2)}</td>
            <td>${trade.currentSL.toFixed(2)}</td>
            <td class="current-r ${currentR !== null ? (currentR >= 0 ? 'positive' : 'negative') : ''}">${formatCurrentR(currentR)}</td>
            <td class="sale-display">${formatSale(sales[0])}</td>
            <td class="sale-display">${formatSale(sales[1])}</td>
            <td class="sale-display">${formatSale(sales[2])}</td>
            <td>${formatStatus(trade.status)}</td>
            <td class="actions-cell">
                <button class="btn btn-edit" onclick="editTrade('${trade.id}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteTrade('${trade.id}')">Delete</button>
            </td>
        </tr>
    `}).join('');
}

// Edit trade
function editTrade(id) {
    const trade = trades.find(t => t.id === id);
    if (!trade) return;

    editingId = id;
    formTitle.textContent = 'Edit Trade';

    document.getElementById('ticker').value = trade.ticker;
    document.getElementById('entryPrice').value = trade.entryPrice;
    document.getElementById('initialSL').value = trade.initialSL;
    document.getElementById('currentSL').value = trade.currentSL;
        document.getElementById('status').value = trade.status;

    // Set dates using Flatpickr
    if (datePickers.entryDate) datePickers.entryDate.setDate(trade.entryDate);

    // Clear existing sales and load trade's sales
    clearSales();

    // Handle both new sales array format and legacy sale1/sale2/sale3 format
    const salesData = trade.sales || [];

    // Convert legacy format if needed
    if (salesData.length === 0) {
        if (trade.sale1?.portion || trade.sale1?.price) {
            salesData.push(trade.sale1);
        }
        if (trade.sale2?.portion || trade.sale2?.price) {
            salesData.push(trade.sale2);
        }
        if (trade.sale3?.portion || trade.sale3?.price) {
            salesData.push(trade.sale3);
        }
    }

    // Add each sale
    salesData.forEach(sale => {
        if (sale && (sale.portion || sale.price)) {
            addSale(sale);
        }
    });

    tradeForm.classList.remove('hidden');
    toggleFormBtn.textContent = '- Hide Form';

    // Scroll to form
    tradeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Delete trade
function deleteTrade(id) {
    if (!confirm('Are you sure you want to delete this trade?')) return;

    trades = trades.filter(t => t.id !== id);
    saveTrades();
    renderTrades();
}

// Export functions for global access (used in onclick handlers)
window.editTrade = editTrade;
window.deleteTrade = deleteTrade;

// PDF Export
document.getElementById('exportPdfBtn').addEventListener('click', exportToPdf);

function exportToPdf() {
    const { jsPDF } = window.jspdf;

    // Get open and partially closed trades
    const openTrades = trades.filter(t => t.status === STATUS.OPEN || t.status === STATUS.PARTIALLY_CLOSED);

    if (openTrades.length === 0) {
        alert('No open trades to export.');
        return;
    }

    // Sort by entry date (oldest first for the PDF)
    openTrades.sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));

    // Create PDF in landscape
    const doc = new jsPDF('l', 'mm', 'a4');

    // Header
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(26, 54, 93); // #1a365d
    doc.rect(14, 14, pageWidth - 28, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bolditalic');
    doc.text('Trade Management Dashboard', pageWidth / 2, 23, { align: 'center' });

    // Table data
    const tableData = openTrades.map(trade => {
        const sales = getTradeSales(trade);
        return [
            trade.ticker,
            trade.entryPrice.toFixed(2),
            formatDate(trade.entryDate),
            trade.initialSL.toFixed(2),
            trade.currentSL.toFixed(2),
            formatSale(sales[0], false),
            formatSale(sales[1], false),
            formatSale(sales[2], false)
        ];
    });

    // Generate table
    doc.autoTable({
        startY: 34,
        head: [['Ticker', 'Entry Price', 'Entry Date', 'Initial SL', 'Current SL', 'Sale 1', 'Sale 2', 'Sale 3']],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: [26, 54, 93],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 10,
            halign: 'left'
        },
        bodyStyles: {
            fontSize: 9,
            textColor: [26, 54, 93],
            lineColor: [26, 54, 93],
            lineWidth: 0.1
        },
        alternateRowStyles: {
            fillColor: [255, 255, 255]
        },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 25 },
            1: { cellWidth: 28 },
            2: { cellWidth: 32 },
            3: { cellWidth: 25 },
            4: { cellWidth: 28 },
            5: { cellWidth: 45 },
            6: { cellWidth: 45 },
            7: { cellWidth: 45 }
        },
        margin: { left: 14, right: 14 }
    });

    // Save the PDF
    const today = new Date().toISOString().split('T')[0];
    doc.save(`trade-tracker-${today}.pdf`);
}

// =====================
// GitHub Gist Sync
// =====================

// Helper to get Gist API headers
function getGistHeaders(includeContentType = false) {
    const token = localStorage.getItem(GIST_TOKEN_KEY);
    const headers = {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
    };
    if (includeContentType) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
}

const syncStatus = document.getElementById('syncStatus');
const gistModal = document.getElementById('gistModal');
const gistSetup = document.getElementById('gistSetup');
const gistConnected = document.getElementById('gistConnected');

// Initialize Gist sync
async function initGistSync() {
    const token = localStorage.getItem(GIST_TOKEN_KEY);
    const gistId = localStorage.getItem(GIST_ID_KEY);

    if (token && gistId) {
        // Already configured, load from Gist
        updateSyncStatus('syncing', 'Syncing...');
        try {
            await loadFromGist();
            updateSyncStatus('synced', 'Synced');
        } catch (err) {
            console.error('Failed to load from Gist:', err);
            updateSyncStatus('error', 'Sync error');
            loadTrades(); // Fall back to localStorage
        }
    } else {
        loadTrades();
        updateSyncStatus('not-synced', 'Enable Sync');
    }
}

const LAST_SYNC_KEY = 'tradeTracker_lastSync';

function updateSyncStatus(status, text) {
    syncStatus.className = 'sync-status ' + status;
    syncStatus.querySelector('.sync-text').textContent = text;

    // Update settings button text based on sync status
    const settingsBtn = document.getElementById('gistSettingsBtn');
    if (settingsBtn) {
        settingsBtn.textContent = status === 'not-synced' ? 'Configure Sync' : 'Sync Settings';
    }

    // Update last synced timestamp on successful sync
    if (status === 'synced') {
        const now = Date.now();
        localStorage.setItem(LAST_SYNC_KEY, now.toString());
        updateLastSyncedDisplay(now);
    }
}

function updateLastSyncedDisplay(timestamp) {
    const displayEl = document.getElementById('lastSyncedDisplay');
    if (!displayEl) return;

    if (!timestamp) {
        displayEl.textContent = 'Never';
        return;
    }

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let timeAgo;
    if (diffMins < 1) {
        timeAgo = 'Just now';
    } else if (diffMins < 60) {
        timeAgo = `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
        timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
        timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
        timeAgo = date.toLocaleDateString();
    }

    displayEl.textContent = timeAgo;
}

// Click sync status to open settings
syncStatus.addEventListener('click', () => {
    document.getElementById('gistSettingsBtn').click();
});

// Keyboard support for sync status (Enter/Space)
syncStatus.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        document.getElementById('gistSettingsBtn').click();
    }
});

// Load trades from Gist
async function loadFromGist() {
    const token = localStorage.getItem(GIST_TOKEN_KEY);
    const gistId = localStorage.getItem(GIST_ID_KEY);

    if (!token || !gistId) return;

    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: getGistHeaders()
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Gist: ${response.status}`);
    }

    const gist = await response.json();
    const content = gist.files['trades.json']?.content;

    if (content) {
        try {
            trades = JSON.parse(content);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
        } catch (e) {
            console.error('Failed to parse trades from Gist:', e);
            trades = [];
        }
    } else {
        trades = [];
    }
}

// Sync trades to Gist (debounced)
let syncTimeout = null;
function syncToGist() {
    const token = localStorage.getItem(GIST_TOKEN_KEY);
    const gistId = localStorage.getItem(GIST_ID_KEY);

    if (!token || !gistId) return;

    // Debounce: wait 2 seconds after last change before syncing
    clearTimeout(syncTimeout);
    updateSyncStatus('syncing', 'Saving...');

    syncTimeout = setTimeout(async () => {
        try {
            await pushToGist();
            updateSyncStatus('synced', 'Synced');
        } catch (err) {
            console.error('Failed to sync to Gist:', err);
            updateSyncStatus('error', 'Sync error');
        }
    }, 2000);
}

// Push trades to Gist
async function pushToGist() {
    const token = localStorage.getItem(GIST_TOKEN_KEY);
    const gistId = localStorage.getItem(GIST_ID_KEY);

    if (!token || !gistId) return;

    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: getGistHeaders(true),
        body: JSON.stringify({
            files: {
                'trades.json': {
                    content: JSON.stringify(trades, null, 2)
                }
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to update Gist: ${response.status}`);
    }
}

// Create a new Gist
async function createGist(token) {
    // Temporarily store token for getGistHeaders to use
    localStorage.setItem(GIST_TOKEN_KEY, token);
    const response = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: getGistHeaders(true),
        body: JSON.stringify({
            description: 'Trade Tracker Data',
            public: false,
            files: {
                'trades.json': {
                    content: JSON.stringify(trades, null, 2)
                }
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to create Gist: ${response.status}`);
    }

    const gist = await response.json();
    return gist.id;
}

// Modal handlers
document.getElementById('gistSettingsBtn').addEventListener('click', () => {
    const token = localStorage.getItem(GIST_TOKEN_KEY);
    const gistId = localStorage.getItem(GIST_ID_KEY);

    if (token && gistId) {
        // Show connected view
        gistSetup.classList.add('hidden');
        gistConnected.classList.remove('hidden');
        document.getElementById('displayGistId').textContent = gistId;

        // Update last synced display
        const lastSync = localStorage.getItem(LAST_SYNC_KEY);
        updateLastSyncedDisplay(lastSync ? parseInt(lastSync) : null);
    } else {
        // Show setup view
        gistSetup.classList.remove('hidden');
        gistConnected.classList.add('hidden');
        document.getElementById('gistToken').value = token || '';
        document.getElementById('gistId').value = gistId || '';
    }

    gistModal.classList.remove('hidden');
});

document.getElementById('cancelGistSettings').addEventListener('click', () => {
    gistModal.classList.add('hidden');
});

document.getElementById('closeGistModal').addEventListener('click', () => {
    gistModal.classList.add('hidden');
});

document.getElementById('saveGistSettings').addEventListener('click', async () => {
    const token = document.getElementById('gistToken').value.trim();
    let gistId = document.getElementById('gistId').value.trim();

    if (!token) {
        alert('Please enter a GitHub token');
        return;
    }

    const saveBtn = document.getElementById('saveGistSettings');
    saveBtn.textContent = 'Connecting...';
    saveBtn.disabled = true;

    try {
        if (!gistId) {
            // Create new Gist
            gistId = await createGist(token);
        } else {
            // Verify existing Gist - temporarily store token for getGistHeaders
            localStorage.setItem(GIST_TOKEN_KEY, token);
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                headers: getGistHeaders()
            });
            if (!response.ok) {
                localStorage.removeItem(GIST_TOKEN_KEY);
                throw new Error('Could not access Gist. Check the ID and token permissions.');
            }
        }

        // Save credentials
        localStorage.setItem(GIST_TOKEN_KEY, token);
        localStorage.setItem(GIST_ID_KEY, gistId);

        // Sync
        await loadFromGist();
        renderTrades();
        updateSyncStatus('synced', 'Synced');

        gistModal.classList.add('hidden');
        alert('Connected to GitHub Gist! Your trades will now sync automatically.');
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        saveBtn.textContent = 'Save & Sync';
        saveBtn.disabled = false;
    }
});

document.getElementById('forceSyncBtn').addEventListener('click', async () => {
    const btn = document.getElementById('forceSyncBtn');
    btn.textContent = 'Syncing...';
    btn.disabled = true;

    try {
        await loadFromGist();
        renderTrades();
        updateSyncStatus('synced', 'Synced');
    } catch (err) {
        alert('Sync failed: ' + err.message);
        updateSyncStatus('error', 'Sync error');
    } finally {
        btn.textContent = 'Sync Manually';
        btn.disabled = false;
    }
});

document.getElementById('disconnectGist').addEventListener('click', () => {
    if (!confirm('Unlink from GitHub Gist? Your local data will be kept.')) return;

    localStorage.removeItem(GIST_TOKEN_KEY);
    localStorage.removeItem(GIST_ID_KEY);
    updateSyncStatus('not-synced', 'Not synced');
    gistModal.classList.add('hidden');
});

// Copy Gist ID to clipboard
document.getElementById('copyGistId').addEventListener('click', async () => {
    const gistId = document.getElementById('displayGistId').textContent;
    const btn = document.getElementById('copyGistId');

    try {
        await navigator.clipboard.writeText(gistId);
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1500);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
});

// Close modal on background click
gistModal.addEventListener('click', (e) => {
    if (e.target === gistModal) {
        gistModal.classList.add('hidden');
    }
});

// Close modal on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !gistModal.classList.contains('hidden')) {
        gistModal.classList.add('hidden');
    }
});

// =====================
// Position Calculator
// =====================

const CALC_ACCOUNT_KEY = 'tradeTracker_accountSize';
const CALC_EXPANDED_KEY = 'tradeTracker_calcExpanded';

// Flag to prevent syncing during initial load
let isLoadingSettings = false;

// Calculator DOM Elements
const toggleCalculatorBtn = document.getElementById('toggleCalculatorBtn');
const calculatorPanel = document.getElementById('calculatorPanel');
const calcAccountSize = document.getElementById('calcAccountSize');
const calcRiskPercent = document.getElementById('calcRiskPercent');
const calcMaxPercent = document.getElementById('calcMaxPercent');
const calcEntryPrice = document.getElementById('calcEntryPrice');
const calcStopLoss = document.getElementById('calcStopLoss');
const calcTargetPrice = document.getElementById('calcTargetPrice');

// Calculator Results - Position Card
const calcShares = document.getElementById('calcShares');
const calcPositionSize = document.getElementById('calcPositionSize');
const calcStopDistance = document.getElementById('calcStopDistance');
const calcTotalRisk = document.getElementById('calcTotalRisk');
const calcPercentAccount = document.getElementById('calcPercentAccount');

// Calculator Results - Target Card
const calcRMultiple = document.getElementById('calcRMultiple');
const calcTargetProfit = document.getElementById('calcTargetProfit');
const calcTargetPriceDisplay = document.getElementById('calcTargetPriceDisplay');
const calcProfitPerShare = document.getElementById('calcProfitPerShare');
const calcROI = document.getElementById('calcROI');
const calcRRMultiple = document.getElementById('calcRRMultiple');

// Calculator state
let accountSize = 0;

// Toggle calculator panel
toggleCalculatorBtn.addEventListener('click', async () => {
    calculatorPanel.classList.toggle('hidden');
    const isExpanded = !calculatorPanel.classList.contains('hidden');
    if (isExpanded) {
        toggleCalculatorBtn.textContent = '- Hide Calculator';
    } else {
        toggleCalculatorBtn.textContent = 'Position Calculator';
    }
    // Save state
    localStorage.setItem(CALC_EXPANDED_KEY, isExpanded.toString());
    // Push immediately (no debounce) so collapse state persists on quick reload
    try {
        await pushSettingsToGist();
    } catch (err) {
        console.error('Failed to sync expanded state:', err);
    }
});

// Convert K/M shorthand notation
function convertShorthand(inputValue) {
    const cleanValue = inputValue.replace(/,/g, '');

    // Check for M (millions) first
    const mMatch = cleanValue.match(/^(\d*\.?\d+)[Mm]$/);
    if (mMatch) {
        const numberPart = parseFloat(mMatch[1]);
        if (!isNaN(numberPart)) {
            return numberPart * 1000000;
        }
    }

    // Check for K (thousands)
    const kMatch = cleanValue.match(/^(\d*\.?\d+)[Kk]$/);
    if (kMatch) {
        const numberPart = parseFloat(kMatch[1]);
        if (!isNaN(numberPart)) {
            return numberPart * 1000;
        }
    }

    return parseFloat(cleanValue.replace(/[^0-9.]/g, '')) || 0;
}

// Format number with commas
function formatNumber(value) {
    return new Intl.NumberFormat('en-US').format(value);
}

// Format currency
function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

// Format percentage
function formatPercentage(value) {
    return `${value.toFixed(2)}%`;
}

// Calculate position
function calculatePosition() {
    const account = accountSize;
    const riskPercent = parseFloat(calcRiskPercent.value) || 1;
    const maxPercent = parseFloat(calcMaxPercent.value) || 100;
    const entry = parseFloat(calcEntryPrice.value) || 0;
    const stopLoss = parseFloat(calcStopLoss.value) || 0;
    const target = parseFloat(calcTargetPrice.value) || 0;

    // Clear previous errors
    clearCalcErrors();

    // Reset results if missing required inputs
    if (!account || !entry || !stopLoss) {
        resetCalcResults();
        return;
    }

    // Validate stop loss is below entry
    if (stopLoss >= entry) {
        showCalcError('stopLoss', 'Stop loss must be below entry price');
        resetCalcResults();
        return;
    }

    // Validate risk percent is reasonable
    if (riskPercent <= 0 || riskPercent > 100) {
        resetCalcResults();
        return;
    }

    // Validate max percent is reasonable
    if (maxPercent <= 0 || maxPercent > 100) {
        resetCalcResults();
        return;
    }

    // Core calculations
    const riskPerShare = entry - stopLoss;
    const dollarRisk = (account * riskPercent) / 100;
    const shares = Math.floor(dollarRisk / riskPerShare);
    const positionSize = shares * entry;

    // Apply max account % limit
    const maxPositionSize = (account * maxPercent) / 100;
    let limitedShares = shares;
    let limitedPositionSize = positionSize;
    let isLimited = false;

    if (positionSize > maxPositionSize) {
        limitedPositionSize = maxPositionSize;
        limitedShares = Math.floor(limitedPositionSize / entry);
        isLimited = true;
    }

    // Calculate final values
    const actualRisk = limitedShares * riskPerShare;
    const stopDistancePercent = (riskPerShare / entry) * 100;
    const percentOfAccount = (limitedPositionSize / account) * 100;

    // Update Position Card UI
    if (isLimited) {
        calcShares.innerHTML = `<span class="original-shares">${formatNumber(shares)}</span> → ${formatNumber(limitedShares)}`;
    } else {
        calcShares.textContent = formatNumber(limitedShares);
    }
    calcShares.classList.toggle('limited', isLimited);
    calcStopDistance.textContent = `${formatCurrency(riskPerShare)} (${stopDistancePercent.toFixed(1)}%)`;
    calcPositionSize.textContent = formatCurrency(limitedPositionSize);
    calcTotalRisk.textContent = formatCurrency(actualRisk);
    calcPercentAccount.textContent = formatPercentage(percentOfAccount);

    // Calculate and update R-levels
    updateRLevels(entry, riskPerShare, limitedShares, target);

    // Calculate and update Target Card
    updateTargetCard(entry, riskPerShare, limitedShares, target);

    // Update export state
    if (typeof updateExportState === 'function') {
        updateExportState();
    }
}

// Update R-levels bar
function updateRLevels(entry, riskPerShare, shares, target) {
    // Calculate which R level the target corresponds to (if any)
    let activeR = 0;
    if (target > entry && riskPerShare > 0) {
        activeR = Math.round((target - entry) / riskPerShare);
    }

    for (let i = 1; i <= 5; i++) {
        const rPrice = entry + (riskPerShare * i);
        const rProfit = shares * riskPerShare * i;

        const priceEl = document.getElementById(`r${i}Price`);
        const profitEl = document.getElementById(`r${i}Profit`);
        const itemEl = document.querySelector(`.r-level-item[data-r="${i}"]`);

        if (priceEl) priceEl.textContent = formatCurrency(rPrice);
        if (profitEl) profitEl.textContent = `+${formatCompactCurrency(rProfit)}`;

        // Highlight active R level
        if (itemEl) {
            itemEl.classList.toggle('active', i === activeR);
        }
    }
}

// Update Target Card
function updateTargetCard(entry, riskPerShare, shares, target) {
    const targetCard = document.querySelector('.calc-target-card');

    if (!target || target <= 0 || !entry || entry <= 0) {
        // Reset target card to inactive state
        calcRMultiple.textContent = '-';
        calcTargetProfit.textContent = '-';
        calcTargetPriceDisplay.textContent = '-';
        calcProfitPerShare.textContent = '-';
        calcROI.textContent = '-';
        calcRRMultiple.textContent = '-';
        targetCard.classList.remove('gain', 'loss');
        targetCard.classList.add('inactive');
        return;
    }

    const profitPerShare = target - entry;
    const totalProfit = shares * profitPerShare;
    const roi = (profitPerShare / entry) * 100;
    const rMultiple = profitPerShare / riskPerShare;

    const sign = totalProfit >= 0 ? '+' : '';
    calcRMultiple.textContent = `${rMultiple.toFixed(1)}R`;
    calcTargetProfit.textContent = `${sign}${formatCurrency(totalProfit)}`;
    calcTargetPriceDisplay.textContent = formatCurrency(target);
    calcProfitPerShare.textContent = `${sign}${formatCurrency(profitPerShare)}`;
    calcROI.textContent = `${sign}${roi.toFixed(1)}%`;
    calcRRMultiple.textContent = `${rMultiple.toFixed(1)}R`;

    // Update card color based on gain/loss
    targetCard.classList.remove('inactive', 'gain', 'loss');
    if (totalProfit >= 0) {
        targetCard.classList.add('gain');
    } else {
        targetCard.classList.add('loss');
    }
}

// Format compact currency (e.g., $10k instead of $10,000)
function formatCompactCurrency(value) {
    if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
        return `$${(value / 1000).toFixed(0)}k`;
    } else {
        return formatCurrency(value);
    }
}

// Reset calculator results
function resetCalcResults() {
    // Position card
    calcShares.textContent = '-';
    calcShares.classList.remove('limited');
    calcPositionSize.textContent = '-';
    calcStopDistance.textContent = '-';
    calcTotalRisk.textContent = '-';
    calcPercentAccount.textContent = '-';

    // Target card
    calcRMultiple.textContent = '-';
    calcTargetProfit.textContent = '-';
    calcTargetPriceDisplay.textContent = '-';
    calcProfitPerShare.textContent = '-';
    calcROI.textContent = '-';
    calcRRMultiple.textContent = '-';
    const targetCard = document.querySelector('.calc-target-card');
    targetCard.classList.remove('gain', 'loss');
    targetCard.classList.add('inactive');

    // R-levels
    for (let i = 1; i <= 5; i++) {
        const priceEl = document.getElementById(`r${i}Price`);
        const profitEl = document.getElementById(`r${i}Profit`);
        const itemEl = document.querySelector(`.r-level-item[data-r="${i}"]`);

        if (priceEl) priceEl.textContent = '-';
        if (profitEl) profitEl.textContent = '-';
        if (itemEl) itemEl.classList.remove('active');
    }

    // Disable export button
    const exportBtn = document.getElementById('exportTradeCard');
    if (exportBtn) exportBtn.disabled = true;
}

// Show calculator error
function showCalcError(field, message) {
    if (field === 'stopLoss') {
        const errorEl = document.getElementById('calcStopLossError');
        const inputEl = document.getElementById('calcStopLoss');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
        if (inputEl) {
            inputEl.classList.add('error');
        }
    }
}

// Clear calculator errors
function clearCalcErrors() {
    const errorEl = document.getElementById('calcStopLossError');
    const inputEl = document.getElementById('calcStopLoss');
    if (errorEl) {
        errorEl.classList.add('hidden');
    }
    if (inputEl) {
        inputEl.classList.remove('error');
    }
}

// Account size input handler with shorthand conversion
calcAccountSize.addEventListener('input', (e) => {
    const inputValue = e.target.value.trim();

    if (inputValue === '') {
        accountSize = 0;
        calculatePosition();
        return;
    }

    // Check for shorthand notation
    if (inputValue.toLowerCase().endsWith('k') || inputValue.toLowerCase().endsWith('m')) {
        const converted = convertShorthand(inputValue);
        if (!isNaN(converted) && converted > 0) {
            accountSize = converted;
            e.target.value = formatNumber(converted);
        }
    } else {
        accountSize = convertShorthand(inputValue);
    }

    calculatePosition();
    saveAccountSize();
});

calcAccountSize.addEventListener('blur', (e) => {
    if (accountSize > 0) {
        e.target.value = formatNumber(accountSize);
    }
});

// Other input handlers
calcRiskPercent.addEventListener('input', calculatePosition);
calcMaxPercent.addEventListener('input', calculatePosition);
calcEntryPrice.addEventListener('input', calculatePosition);
calcStopLoss.addEventListener('input', calculatePosition);
calcTargetPrice.addEventListener('input', calculatePosition);

// Save calculator fields on change (debounced via syncSettingsToGist)
const calcFieldInputs = [calcEntryPrice, calcStopLoss, calcTargetPrice, document.getElementById('calcTicker')];
calcFieldInputs.forEach(input => {
    if (input) {
        input.addEventListener('input', syncSettingsToGist);
    }
});

// Clear calculator button
document.getElementById('clearCalculatorBtn').addEventListener('click', () => {
    calcEntryPrice.value = '';
    calcStopLoss.value = '';
    calcTargetPrice.value = '';
    document.getElementById('calcTicker').value = '';
    calculatePosition();
    syncSettingsToGist();
    // Update export button state
    if (typeof updateExportState === 'function') {
        updateExportState();
    }
});

// Mobile keyboard navigation - Enter key moves to next field
// Skip Ticker (optional) - go from Stop Loss straight to results
const calcFieldOrder = ['calcAccountSize', 'calcEntryPrice', 'calcStopLoss'];

calcFieldOrder.forEach((fieldId, index) => {
    const field = document.getElementById(fieldId);
    if (field) {
        field.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const nextIndex = index + 1;
                if (nextIndex < calcFieldOrder.length) {
                    // Move to next field
                    const nextField = document.getElementById(calcFieldOrder[nextIndex]);
                    if (nextField) {
                        nextField.focus();
                        // Select all text for easy replacement
                        if (nextField.select) nextField.select();
                    }
                } else {
                    // After stop loss - dismiss keyboard and scroll to results
                    field.blur();
                    setTimeout(() => {
                        const resultsCard = document.querySelector('.calc-position-card');
                        if (resultsCard) {
                            resultsCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, 100);
                }
            }
        });
    }
});

// Ticker and Target Price - Enter dismisses keyboard
['calcTicker', 'calcTargetPrice'].forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
        field.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                field.blur();
            }
        });
    }
});

// Copy stop loss to clipboard
document.getElementById('copyCalcStopLoss').addEventListener('click', async () => {
    const value = calcStopLoss.value;
    if (!value) return;

    const btn = document.getElementById('copyCalcStopLoss');
    try {
        await navigator.clipboard.writeText(value);
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1500);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
});

// Calculator click event delegation
calculatorPanel.addEventListener('click', (e) => {
    const target = e.target;

    // Increment/decrement buttons
    if (target.classList.contains('increment-btn')) {
        const targetId = target.dataset.target;
        const delta = parseFloat(target.dataset.delta);
        const input = document.getElementById(targetId);

        if (input) {
            const currentValue = parseFloat(input.value) || 0;
            const newValue = Math.max(0, currentValue + delta);
            input.value = newValue.toFixed(2);
            calculatePosition();
        }
        return;
    }

    // R-level items
    const rLevelItem = target.closest('.r-level-item');
    if (rLevelItem) {
        const rLevel = parseInt(rLevelItem.dataset.r);
        const entry = parseFloat(calcEntryPrice.value) || 0;
        const stopLoss = parseFloat(calcStopLoss.value) || 0;

        if (entry > 0 && stopLoss > 0 && stopLoss < entry) {
            const riskPerShare = entry - stopLoss;
            const targetPrice = entry + (riskPerShare * rLevel);
            calcTargetPrice.value = targetPrice.toFixed(2);
            calculatePosition();
        }
        return;
    }

    // Risk preset buttons
    if (target.classList.contains('risk-preset') && !target.classList.contains('custom-toggle')) {
        const value = parseFloat(target.dataset.value);
        calcRiskPercent.value = value;

        // Update active state
        document.querySelectorAll('.risk-preset').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        document.getElementById('customRiskWrapper').classList.remove('active');
        document.getElementById('customRiskWrapper').classList.add('hidden');
        document.getElementById('calcCustomRisk').value = '';
        document.getElementById('customRiskToggle').classList.remove('hidden');

        calculatePosition();
        return;
    }

    // Max preset buttons
    if (target.classList.contains('max-preset') && !target.classList.contains('custom-toggle')) {
        const value = parseFloat(target.dataset.value);
        calcMaxPercent.value = value;

        // Update active state
        document.querySelectorAll('.max-preset').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        document.getElementById('customMaxWrapper').classList.remove('active');
        document.getElementById('customMaxWrapper').classList.add('hidden');
        document.getElementById('calcCustomMax').value = '';
        document.getElementById('customMaxToggle').classList.remove('hidden');

        calculatePosition();
        return;
    }
});

// Custom toggle buttons
document.getElementById('customRiskToggle').addEventListener('click', () => {
    const toggle = document.getElementById('customRiskToggle');
    const wrapper = document.getElementById('customRiskWrapper');
    const input = document.getElementById('calcCustomRisk');

    toggle.classList.add('hidden');
    wrapper.classList.remove('hidden');
    input.focus();

    document.querySelectorAll('.risk-preset').forEach(b => b.classList.remove('active'));
});

document.getElementById('customMaxToggle').addEventListener('click', () => {
    const toggle = document.getElementById('customMaxToggle');
    const wrapper = document.getElementById('customMaxWrapper');
    const input = document.getElementById('calcCustomMax');

    toggle.classList.add('hidden');
    wrapper.classList.remove('hidden');
    input.focus();

    document.querySelectorAll('.max-preset').forEach(b => b.classList.remove('active'));
});

// Custom risk input
document.getElementById('calcCustomRisk').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    const wrapper = document.getElementById('customRiskWrapper');
    if (value > 0) {
        calcRiskPercent.value = value;
        document.querySelectorAll('.risk-preset').forEach(b => b.classList.remove('active'));
        wrapper.classList.add('active');
        calculatePosition();
    } else {
        wrapper.classList.remove('active');
    }
});

document.getElementById('calcCustomRisk').addEventListener('blur', (e) => {
    const input = e.target;
    const wrapper = document.getElementById('customRiskWrapper');
    const toggle = document.getElementById('customRiskToggle');

    if (!input.value) {
        wrapper.classList.add('hidden');
        wrapper.classList.remove('active');
        toggle.classList.remove('hidden');
        // Restore default active preset
        const value = parseFloat(calcRiskPercent.value);
        document.querySelectorAll('.risk-preset').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.value) === value);
        });
    }
});

// Custom max input
document.getElementById('calcCustomMax').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    const wrapper = document.getElementById('customMaxWrapper');
    if (value > 0) {
        calcMaxPercent.value = value;
        document.querySelectorAll('.max-preset').forEach(b => b.classList.remove('active'));
        wrapper.classList.add('active');
        calculatePosition();
    } else {
        wrapper.classList.remove('active');
    }
});

document.getElementById('calcCustomMax').addEventListener('blur', (e) => {
    const input = e.target;
    const wrapper = document.getElementById('customMaxWrapper');
    const toggle = document.getElementById('customMaxToggle');

    if (!input.value) {
        wrapper.classList.add('hidden');
        wrapper.classList.remove('active');
        toggle.classList.remove('hidden');
        // Restore default active preset
        const value = parseFloat(calcMaxPercent.value);
        document.querySelectorAll('.max-preset').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.value) === value);
        });
    }
});

// Update preset button active states when input changes
calcRiskPercent.addEventListener('input', () => {
    const value = parseFloat(calcRiskPercent.value);
    const customRisk = document.getElementById('calcCustomRisk');
    const customWrapper = document.getElementById('customRiskWrapper');
    const customToggle = document.getElementById('customRiskToggle');
    const hasPresetMatch = [...document.querySelectorAll('.risk-preset:not(.custom-toggle)')].some(btn => parseFloat(btn.dataset.value) === value);

    document.querySelectorAll('.risk-preset:not(.custom-toggle)').forEach(btn => {
        btn.classList.toggle('active', parseFloat(btn.dataset.value) === value);
    });

    if (!hasPresetMatch && value > 0) {
        customRisk.value = value;
        customWrapper.classList.add('active');
        customWrapper.classList.remove('hidden');
        customToggle.classList.add('hidden');
    } else {
        customWrapper.classList.remove('active');
    }
});

calcMaxPercent.addEventListener('input', () => {
    const value = parseFloat(calcMaxPercent.value);
    const customMax = document.getElementById('calcCustomMax');
    const customWrapper = document.getElementById('customMaxWrapper');
    const customToggle = document.getElementById('customMaxToggle');
    const hasPresetMatch = [...document.querySelectorAll('.max-preset:not(.custom-toggle)')].some(btn => parseFloat(btn.dataset.value) === value);

    document.querySelectorAll('.max-preset:not(.custom-toggle)').forEach(btn => {
        btn.classList.toggle('active', parseFloat(btn.dataset.value) === value);
    });

    if (!hasPresetMatch && value > 0) {
        customMax.value = value;
        customWrapper.classList.add('active');
        customWrapper.classList.remove('hidden');
        customToggle.classList.add('hidden');
    } else {
        customWrapper.classList.remove('active');
    }
});

// Default settings
let defaultRiskPercent = 1;
let defaultMaxPercent = 100;

// Save account size to localStorage and sync to Gist
function saveAccountSize() {
    localStorage.setItem(CALC_ACCOUNT_KEY, accountSize.toString());
    syncSettingsToGist();
}

// Set default risk handler
document.getElementById('setDefaultRisk').addEventListener('click', (e) => {
    const value = parseFloat(calcRiskPercent.value) || 1;
    defaultRiskPercent = value;
    localStorage.setItem('tradeTracker_defaultRisk', value.toString());
    syncSettingsToGist();

    // Show saved feedback
    const btn = e.target;
    btn.textContent = 'Saved!';
    btn.classList.add('saved');
    setTimeout(() => {
        btn.textContent = 'Set as default';
        btn.classList.remove('saved');
    }, 1500);
});

// Set default max position handler
document.getElementById('setDefaultMax').addEventListener('click', (e) => {
    const value = parseFloat(calcMaxPercent.value) || 100;
    defaultMaxPercent = value;
    localStorage.setItem('tradeTracker_defaultMax', value.toString());
    syncSettingsToGist();

    // Show saved feedback
    const btn = e.target;
    btn.textContent = 'Saved!';
    btn.classList.add('saved');
    setTimeout(() => {
        btn.textContent = 'Set as default';
        btn.classList.remove('saved');
    }, 1500);
});

// Load default settings from localStorage
function loadDefaultSettings() {
    const storedRisk = localStorage.getItem('tradeTracker_defaultRisk');
    const storedMax = localStorage.getItem('tradeTracker_defaultMax');

    if (storedRisk) {
        defaultRiskPercent = parseFloat(storedRisk);
        calcRiskPercent.value = defaultRiskPercent;
        document.querySelectorAll('.risk-preset').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.value) === defaultRiskPercent);
        });
    }

    if (storedMax) {
        defaultMaxPercent = parseFloat(storedMax);
        calcMaxPercent.value = defaultMaxPercent;
        document.querySelectorAll('.max-preset').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.value) === defaultMaxPercent);
        });
    }
}

// Load account size from localStorage
function loadAccountSize() {
    const stored = localStorage.getItem(CALC_ACCOUNT_KEY);
    if (stored) {
        accountSize = parseFloat(stored) || 0;
        if (accountSize > 0) {
            calcAccountSize.value = formatNumber(accountSize);
        }
    }
}

// Load calculator expanded state from localStorage
function loadCalcExpandedState() {
    const stored = localStorage.getItem(CALC_EXPANDED_KEY);
    if (stored === 'true') {
        calculatorPanel.classList.remove('hidden');
        toggleCalculatorBtn.textContent = '- Hide Calculator';
    }
}

// Sync settings (account size) to Gist
let settingsSyncTimeout = null;
function syncSettingsToGist() {
    // Don't sync while loading settings from Gist
    if (isLoadingSettings) return;

    const token = localStorage.getItem(GIST_TOKEN_KEY);
    const gistId = localStorage.getItem(GIST_ID_KEY);

    if (!token || !gistId) return;

    clearTimeout(settingsSyncTimeout);
    settingsSyncTimeout = setTimeout(async () => {
        try {
            await pushSettingsToGist();
        } catch (err) {
            console.error('Failed to sync settings to Gist:', err);
        }
    }, 2000);
}

// Push settings to Gist
async function pushSettingsToGist() {
    const token = localStorage.getItem(GIST_TOKEN_KEY);
    const gistId = localStorage.getItem(GIST_ID_KEY);

    if (!token || !gistId) return;

    const settings = {
        accountSize: accountSize,
        defaultRiskPercent: defaultRiskPercent,
        defaultMaxPercent: defaultMaxPercent,
        calcExpanded: localStorage.getItem(CALC_EXPANDED_KEY) === 'true',
        watchlist: watchlist,
        calcFields: {
            entryPrice: calcEntryPrice.value,
            stopLoss: calcStopLoss.value,
            ticker: document.getElementById('calcTicker').value,
            targetPrice: calcTargetPrice.value
        }
    };

    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: getGistHeaders(true),
        body: JSON.stringify({
            files: {
                'settings.json': {
                    content: JSON.stringify(settings, null, 2)
                }
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to update Gist settings: ${response.status}`);
    }
}

// Load settings from Gist
async function loadSettingsFromGist() {
    const token = localStorage.getItem(GIST_TOKEN_KEY);
    const gistId = localStorage.getItem(GIST_ID_KEY);

    if (!token || !gistId) return;

    isLoadingSettings = true;

    try {
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: getGistHeaders()
        });

        if (!response.ok) return;

        const gist = await response.json();
        const content = gist.files['settings.json']?.content;

        if (content) {
            const settings = JSON.parse(content);
            if (settings.accountSize && settings.accountSize > 0) {
                accountSize = settings.accountSize;
                localStorage.setItem(CALC_ACCOUNT_KEY, accountSize.toString());
                calcAccountSize.value = formatNumber(accountSize);
            }
            if (settings.defaultRiskPercent) {
                defaultRiskPercent = settings.defaultRiskPercent;
                localStorage.setItem('tradeTracker_defaultRisk', defaultRiskPercent.toString());
                calcRiskPercent.value = defaultRiskPercent;
                document.querySelectorAll('.risk-preset').forEach(btn => {
                    btn.classList.toggle('active', parseFloat(btn.dataset.value) === defaultRiskPercent);
                });
            }
            if (settings.defaultMaxPercent) {
                defaultMaxPercent = settings.defaultMaxPercent;
                localStorage.setItem('tradeTracker_defaultMax', defaultMaxPercent.toString());
                calcMaxPercent.value = defaultMaxPercent;
                document.querySelectorAll('.max-preset').forEach(btn => {
                    btn.classList.toggle('active', parseFloat(btn.dataset.value) === defaultMaxPercent);
                });
            }
            if (settings.calcExpanded !== undefined) {
                localStorage.setItem(CALC_EXPANDED_KEY, settings.calcExpanded.toString());
                if (settings.calcExpanded) {
                    calculatorPanel.classList.remove('hidden');
                    toggleCalculatorBtn.textContent = '- Hide Calculator';
                } else {
                    calculatorPanel.classList.add('hidden');
                    toggleCalculatorBtn.textContent = 'Position Calculator';
                }
            }
            if (settings.watchlist && Array.isArray(settings.watchlist)) {
                watchlist = settings.watchlist;
                localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
                renderWatchlistPills();
            }
            if (settings.calcFields) {
                const fields = settings.calcFields;
                if (fields.entryPrice) calcEntryPrice.value = fields.entryPrice;
                if (fields.stopLoss) calcStopLoss.value = fields.stopLoss;
                if (fields.ticker) document.getElementById('calcTicker').value = fields.ticker;
                if (fields.targetPrice) calcTargetPrice.value = fields.targetPrice;
                // Recalculate with restored values
                calculatePosition();
            }
        }
    } catch (err) {
        console.error('Failed to load settings from Gist:', err);
    } finally {
        isLoadingSettings = false;
    }
}

// Initialize calculator on page load
document.addEventListener('DOMContentLoaded', async () => {
    loadAccountSize();
    loadDefaultSettings();
    loadCalcExpandedState();

    // If connected to Gist, also load settings from there
    const token = localStorage.getItem(GIST_TOKEN_KEY);
    const gistId = localStorage.getItem(GIST_ID_KEY);
    if (token && gistId) {
        await loadSettingsFromGist();
    }
});

// ============================================
// Watchlist Feature
// ============================================

// Watchlist DOM elements
const watchlistBar = document.getElementById('watchlistBar');
const watchlistModal = document.getElementById('watchlistModal');
const manageWatchlistBtn = document.getElementById('manageWatchlistBtn');
const closeWatchlistModal = document.getElementById('closeWatchlistModal');
const cancelWatchlistBtn = document.getElementById('cancelWatchlistBtn');
const saveWatchlistBtn = document.getElementById('saveWatchlistBtn');
const watchlistInput = document.getElementById('watchlistInput');

// Load watchlist from localStorage
function loadWatchlist() {
    const stored = localStorage.getItem(WATCHLIST_KEY);
    if (stored) {
        try {
            watchlist = JSON.parse(stored);
            renderWatchlistPills();
        } catch (e) {
            console.error('Failed to parse watchlist:', e);
            watchlist = [];
        }
    }
}

// Save watchlist to localStorage and sync to Gist
function saveWatchlist() {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    renderWatchlistPills();
    syncSettingsToGist();
}

// Open TradingView chart for a ticker
function openTradingViewChart(ticker) {
    // TradingView web URL format - on Windows, the desktop app will intercept this
    const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(ticker)}`;
    window.open(url, '_blank');
}

// Render watchlist pills
function renderWatchlistPills() {
    if (watchlist.length === 0) {
        watchlistBar.classList.add('hidden');
        return;
    }

    watchlistBar.classList.remove('hidden');
    watchlistBar.innerHTML = `
        <span class="watchlist-label">Watchlist:</span>
        ${watchlist.map(ticker => `<button class="watchlist-pill" data-ticker="${ticker}" title="Click to fill ticker, Shift+Click to open TradingView">${ticker}</button>`).join('')}
        <button class="watchlist-clear" id="clearWatchlist">× Clear All</button>
    `;

    // Add click listeners to pills
    watchlistBar.querySelectorAll('.watchlist-pill').forEach(pill => {
        // iOS keyboard trick: focus proxy input on touchstart to "prime" the keyboard
        pill.addEventListener('touchstart', () => {
            const proxyInput = document.getElementById('iosKeyboardProxy');
            if (proxyInput) {
                proxyInput.focus();
            }
        }, { passive: true });

        pill.addEventListener('click', (e) => {
            const ticker = pill.dataset.ticker;

            // Shift+click opens TradingView chart
            if (e.shiftKey) {
                openTradingViewChart(ticker);
                return;
            }

            // Regular click fills the ticker field
            const tickerInput = document.getElementById('calcTicker');
            if (tickerInput) {
                tickerInput.value = ticker;
                tickerInput.dispatchEvent(new Event('input', { bubbles: true }));

                // Expand calculator if collapsed
                if (calculatorPanel.classList.contains('hidden')) {
                    calculatorPanel.classList.remove('hidden');
                    toggleCalculatorBtn.textContent = '- Hide Calculator';
                    localStorage.setItem(CALC_EXPANDED_KEY, 'true');
                    syncSettingsToGist();
                }

                // Focus entry price - keyboard should already be primed from touchstart
                const entryPriceInput = document.getElementById('calcEntryPrice');
                if (entryPriceInput) {
                    entryPriceInput.focus();
                    entryPriceInput.select();
                    entryPriceInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        });
    });

    // Clear all listener
    const clearBtn = document.getElementById('clearWatchlist');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Clear all tickers from your watchlist?')) {
                watchlist = [];
                saveWatchlist();
            }
        });
    }
}

// Parse tickers from input string
function parseWatchlistInput(input) {
    return input
        .toUpperCase()
        .split(/[,\s]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0 && /^[A-Z]{1,5}$/.test(t))
        .slice(0, 10); // Max 10 tickers
}

// Open watchlist modal
manageWatchlistBtn.addEventListener('click', () => {
    // Populate textarea with current watchlist
    watchlistInput.value = watchlist.join(', ');
    watchlistModal.classList.remove('hidden');
    watchlistInput.focus();
});

// Close watchlist modal
function closeWatchlistModalFn() {
    watchlistModal.classList.add('hidden');
}

closeWatchlistModal.addEventListener('click', closeWatchlistModalFn);
cancelWatchlistBtn.addEventListener('click', closeWatchlistModalFn);

// Close modal on background click
watchlistModal.addEventListener('click', (e) => {
    if (e.target === watchlistModal) {
        closeWatchlistModalFn();
    }
});

// Close modal on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !watchlistModal.classList.contains('hidden')) {
        closeWatchlistModalFn();
    }
});

// Save watchlist
saveWatchlistBtn.addEventListener('click', () => {
    const parsed = parseWatchlistInput(watchlistInput.value);

    // Remove duplicates while preserving order
    watchlist = [...new Set(parsed)];

    saveWatchlist();
    closeWatchlistModalFn();
});

// Initialize watchlist on page load
document.addEventListener('DOMContentLoaded', () => {
    loadWatchlist();

    // Chart link button for ticker input
    const openTickerChartBtn = document.getElementById('openTickerChart');
    const calcTickerInput = document.getElementById('calcTicker');

    // Enable/disable chart button based on ticker input
    calcTickerInput.addEventListener('input', () => {
        const ticker = calcTickerInput.value.trim();
        openTickerChartBtn.disabled = !ticker;
    });

    // Click handler for chart button
    openTickerChartBtn.addEventListener('click', () => {
        const ticker = calcTickerInput.value.trim().toUpperCase();
        if (ticker) {
            openTradingViewChart(ticker);
        }
    });

    // Shift+Enter to open chart from ticker input
    calcTickerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            const ticker = calcTickerInput.value.trim().toUpperCase();
            if (ticker) {
                openTradingViewChart(ticker);
            }
        }
    });
});

// ============================================
// Trade Card Export Feature
// ============================================

const exportTradeCardBtn = document.getElementById('exportTradeCard');
const exportModal = document.getElementById('exportModal');
const closeExportModal = document.getElementById('closeExportModal');
const privacyModeCheckbox = document.getElementById('privacyMode');
const copyCardBtn = document.getElementById('copyCardBtn');
const downloadCardBtn = document.getElementById('downloadCardBtn');
const tradeCardPreview = document.getElementById('tradeCardPreview');

// Track current calculator state for export
let currentCalcState = {
    ticker: '',
    shares: 0,
    positionSize: 0,
    entryPrice: 0,
    stopLoss: 0,
    riskPercent: 0,
    percentOfAccount: 0,
    accountSize: 0,
    hasValidData: false
};

// Update export button state and current calc state
function updateExportState() {
    const shares = parseInt(calcShares.textContent.replace(/,/g, '')) || 0;
    const entry = parseFloat(calcEntryPrice.value) || 0;
    const stopLoss = parseFloat(calcStopLoss.value) || 0;
    const ticker = document.getElementById('calcTicker').value.trim().toUpperCase() || 'N/A';

    // Parse position size from display
    const positionSizeText = calcPositionSize.textContent;
    const positionSize = parseFloat(positionSizeText.replace(/[$,]/g, '')) || 0;

    // Parse percent of account from display
    const percentAccountText = calcPercentAccount.textContent;
    const percentOfAccount = parseFloat(percentAccountText.replace('%', '')) || 0;

    const riskPercent = parseFloat(calcRiskPercent.value) || 0;

    const hasTicker = ticker && ticker !== 'N/A';
    const hasValidData = shares > 0 && entry > 0 && stopLoss > 0 && accountSize > 0 && hasTicker;

    currentCalcState = {
        ticker,
        shares,
        positionSize,
        entryPrice: entry,
        stopLoss,
        riskPercent,
        percentOfAccount,
        accountSize,
        hasValidData
    };

    exportTradeCardBtn.disabled = !hasValidData;

    // Update tooltip based on what's missing
    if (!hasValidData) {
        const missing = [];
        if (!entry) missing.push('entry price');
        if (!stopLoss) missing.push('stop loss');
        if (!hasTicker) missing.push('ticker');
        if (!accountSize) missing.push('account size');

        if (missing.length > 0) {
            exportTradeCardBtn.title = `Add ${missing.join(', ')} to export`;
        } else {
            exportTradeCardBtn.title = 'Export trade card';
        }
    } else {
        exportTradeCardBtn.title = 'Export trade card';
    }
}

// Format date for card
function formatCardDate(date) {
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// Update trade card preview with current data
function updateTradeCardPreview() {
    const state = currentCalcState;
    const privacyMode = privacyModeCheckbox.checked;

    // Update card content
    document.getElementById('cardTicker').textContent = state.ticker;
    document.getElementById('cardDate').textContent = formatCardDate(new Date());
    document.getElementById('cardShares').textContent = formatNumber(state.shares);
    document.getElementById('cardEntry').textContent = formatCurrency(state.entryPrice);
    document.getElementById('cardStop').textContent = formatCurrency(state.stopLoss);
    document.getElementById('cardRisk').textContent = state.riskPercent + '%';

    // Privacy mode elements
    const positionEl = document.getElementById('cardPosition');
    const percentAccountRow = document.getElementById('cardPercentAccountRow');
    const percentAccountEl = document.getElementById('cardPercentAccount');
    const accountRowEl = document.getElementById('cardAccountRow');
    const accountEl = document.getElementById('cardAccount');

    if (privacyMode) {
        tradeCardPreview.classList.add('privacy-mode');
        positionEl.style.display = 'none';
        percentAccountRow.style.display = 'none';
        accountRowEl.style.display = 'none';
    } else {
        tradeCardPreview.classList.remove('privacy-mode');
        positionEl.style.display = '';
        positionEl.textContent = formatCurrency(state.positionSize) + ' position';
        percentAccountRow.style.display = '';
        percentAccountEl.textContent = state.percentOfAccount.toFixed(1) + '%';
        accountRowEl.style.display = '';
        accountEl.textContent = formatCurrency(state.accountSize);
    }
}

// Open export modal
exportTradeCardBtn.addEventListener('click', () => {
    if (!currentCalcState.hasValidData) return;

    updateTradeCardPreview();
    exportModal.classList.remove('hidden');
});

// Close export modal
closeExportModal.addEventListener('click', () => {
    exportModal.classList.add('hidden');
});

exportModal.addEventListener('click', (e) => {
    if (e.target === exportModal) {
        exportModal.classList.add('hidden');
    }
});

// Privacy mode toggle
privacyModeCheckbox.addEventListener('change', updateTradeCardPreview);

// Generate card image using html2canvas
async function generateCardImage() {
    const card = tradeCardPreview;

    // Temporarily set explicit dimensions for rendering
    const originalWidth = card.style.width;
    card.style.width = '280px';

    try {
        const canvas = await html2canvas(card, {
            scale: 4, // 4x resolution for high quality
            backgroundColor: null, // Transparent background
            logging: false,
            useCORS: true
        });

        card.style.width = originalWidth;
        return canvas;
    } catch (err) {
        card.style.width = originalWidth;
        throw err;
    }
}

// Copy to clipboard
copyCardBtn.addEventListener('click', async () => {
    try {
        const canvas = await generateCardImage();

        canvas.toBlob(async (blob) => {
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);

                // Show success feedback
                const originalText = copyCardBtn.innerHTML;
                copyCardBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Copied!
                `;
                copyCardBtn.classList.add('btn-success');

                setTimeout(() => {
                    copyCardBtn.innerHTML = originalText;
                    copyCardBtn.classList.remove('btn-success');
                }, 2000);
            } catch (err) {
                console.error('Failed to copy to clipboard:', err);
                alert('Failed to copy to clipboard. Try downloading instead.');
            }
        }, 'image/png');
    } catch (err) {
        console.error('Failed to generate card image:', err);
        alert('Failed to generate card image.');
    }
});

// Download PNG
downloadCardBtn.addEventListener('click', async () => {
    try {
        const canvas = await generateCardImage();

        // Create download link
        const link = document.createElement('a');
        const ticker = currentCalcState.ticker || 'trade';
        const date = new Date().toISOString().split('T')[0];
        link.download = `${ticker}-${date}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        // Show success feedback
        const originalText = downloadCardBtn.innerHTML;
        downloadCardBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Downloaded!
        `;
        downloadCardBtn.classList.add('btn-success');

        setTimeout(() => {
            downloadCardBtn.innerHTML = originalText;
            downloadCardBtn.classList.remove('btn-success');
        }, 2000);
    } catch (err) {
        console.error('Failed to generate card image:', err);
        alert('Failed to generate card image.');
    }
});

// Listen for calculator updates to update export state
const calcInputs = [calcEntryPrice, calcStopLoss, calcTargetPrice, document.getElementById('calcTicker')];
calcInputs.forEach(input => {
    if (input) {
        input.addEventListener('input', () => {
            setTimeout(updateExportState, 100);
        });
    }
});

// Also update when risk/max changes
calcRiskPercent.addEventListener('input', () => setTimeout(updateExportState, 100));
calcMaxPercent.addEventListener('input', () => setTimeout(updateExportState, 100));

// Update state when account size changes
calcAccountSize.addEventListener('input', () => setTimeout(updateExportState, 100));
