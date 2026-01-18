// Trade Tracker App

const STORAGE_KEY = 'tradeTracker_trades';
const GIST_TOKEN_KEY = 'tradeTracker_gistToken';
const GIST_ID_KEY = 'tradeTracker_gistId';

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
const MAX_UNDO = 50;

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

    const saleDateConfig = {
        ...flatpickrConfig,
        onClose: function(selectedDates, dateStr, instance) {
            // Preserve empty state
        }
    };

    datePickers.entryDate = flatpickr('#entryDate', entryDateConfig);
    datePickers.sale1Date = flatpickr('#sale1Date', saleDateConfig);
    datePickers.sale2Date = flatpickr('#sale2Date', saleDateConfig);
    datePickers.sale3Date = flatpickr('#sale3Date', saleDateConfig);
}

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
        trades = JSON.parse(stored);
    }
}

// Save trades to localStorage and sync to Gist
function saveTrades() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
    syncToGist();
}

// Handle form submission
function handleFormSubmit(e) {
    e.preventDefault();

    const trade = {
        id: editingId || Date.now().toString(),
        ticker: document.getElementById('ticker').value.toUpperCase(),
        entryPrice: parseFloat(document.getElementById('entryPrice').value),
        entryDate: document.getElementById('entryDate').value,
        initialSL: parseFloat(document.getElementById('initialSL').value),
        currentSL: parseFloat(document.getElementById('currentSL').value),
        status: document.getElementById('status').value,
        sale1: {
            portion: document.getElementById('sale1Portion').value,
            price: document.getElementById('sale1Price').value ? parseFloat(document.getElementById('sale1Price').value) : null,
            date: document.getElementById('sale1Date').value || null
        },
        sale2: {
            portion: document.getElementById('sale2Portion').value,
            price: document.getElementById('sale2Price').value ? parseFloat(document.getElementById('sale2Price').value) : null,
            date: document.getElementById('sale2Date').value || null
        },
        sale3: {
            portion: document.getElementById('sale3Portion').value,
            price: document.getElementById('sale3Price').value ? parseFloat(document.getElementById('sale3Price').value) : null,
            date: document.getElementById('sale3Date').value || null
        }
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
    if (datePickers.sale1Date) datePickers.sale1Date.clear();
    if (datePickers.sale2Date) datePickers.sale2Date.clear();
    if (datePickers.sale3Date) datePickers.sale3Date.clear();
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
function formatSale(sale) {
    if (!sale.portion || !sale.price) {
        return '<span class="sale-empty">-</span>';
    }
    const dateStr = sale.date ? ` ${formatShortDate(sale.date)}` : '';
    return `${sale.portion} @ ${sale.price.toFixed(2)}${dateStr}`;
}

// Format status for display
function formatStatus(status) {
    const labels = {
        'open': 'Open',
        'partially_closed': 'Partial',
        'closed': 'Closed',
        'stopped_out': 'Stopped'
    };
    return `<span class="status-badge status-${status}">${labels[status] || status}</span>`;
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
            : `No ${filter.replace('_', ' ')} trades found.`;
        return;
    }

    tradesTable.classList.remove('hidden');
    noTradesMsg.classList.add('hidden');

    tradesBody.innerHTML = filteredTrades.map(trade => `
        <tr data-id="${trade.id}">
            <td><strong>${trade.ticker}</strong></td>
            <td>${trade.entryPrice.toFixed(2)}</td>
            <td>${formatDate(trade.entryDate)}</td>
            <td>${trade.initialSL.toFixed(2)}</td>
            <td>${trade.currentSL.toFixed(2)}</td>
            <td class="sale-display">${formatSale(trade.sale1)}</td>
            <td class="sale-display">${formatSale(trade.sale2)}</td>
            <td class="sale-display">${formatSale(trade.sale3)}</td>
            <td>${formatStatus(trade.status)}</td>
            <td class="actions-cell">
                <button class="btn btn-edit" onclick="editTrade('${trade.id}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteTrade('${trade.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
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

    // Sale 1
    document.getElementById('sale1Portion').value = trade.sale1?.portion || '';
    document.getElementById('sale1Price').value = trade.sale1?.price || '';
    if (datePickers.sale1Date) datePickers.sale1Date.setDate(trade.sale1?.date || null);

    // Sale 2
    document.getElementById('sale2Portion').value = trade.sale2?.portion || '';
    document.getElementById('sale2Price').value = trade.sale2?.price || '';
    if (datePickers.sale2Date) datePickers.sale2Date.setDate(trade.sale2?.date || null);

    // Sale 3
    document.getElementById('sale3Portion').value = trade.sale3?.portion || '';
    document.getElementById('sale3Price').value = trade.sale3?.price || '';
    if (datePickers.sale3Date) datePickers.sale3Date.setDate(trade.sale3?.date || null);

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

function formatSaleText(sale) {
    if (!sale.portion || !sale.price) return '-';
    const dateStr = sale.date ? ` ${formatShortDate(sale.date)}` : '';
    return `${sale.portion} @ ${sale.price.toFixed(2)}${dateStr}`;
}

function exportToPdf() {
    const { jsPDF } = window.jspdf;

    // Get open and partially closed trades
    const openTrades = trades.filter(t => t.status === 'open' || t.status === 'partially_closed');

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
    doc.text('Trade Management for Swing Trades', pageWidth / 2, 23, { align: 'center' });

    // Table data
    const tableData = openTrades.map(trade => [
        trade.ticker,
        trade.entryPrice.toFixed(2),
        formatDate(trade.entryDate),
        trade.initialSL.toFixed(2),
        trade.currentSL.toFixed(2),
        formatSaleText(trade.sale1),
        formatSaleText(trade.sale2),
        formatSaleText(trade.sale3)
    ]);

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
        updateSyncStatus('', '');
    }
}

function updateSyncStatus(status, text) {
    syncStatus.className = 'sync-status ' + status;
    syncStatus.textContent = text;
}

// Load trades from Gist
async function loadFromGist() {
    const token = localStorage.getItem(GIST_TOKEN_KEY);
    const gistId = localStorage.getItem(GIST_ID_KEY);

    if (!token || !gistId) return;

    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Gist: ${response.status}`);
    }

    const gist = await response.json();
    const content = gist.files['trades.json']?.content;

    if (content) {
        trades = JSON.parse(content);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
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
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
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
    const response = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
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
            // Verify existing Gist
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!response.ok) {
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
        btn.textContent = 'Force Sync Now';
        btn.disabled = false;
    }
});

document.getElementById('disconnectGist').addEventListener('click', () => {
    if (!confirm('Disconnect from GitHub Gist? Your local data will be kept.')) return;

    localStorage.removeItem(GIST_TOKEN_KEY);
    localStorage.removeItem(GIST_ID_KEY);
    updateSyncStatus('', '');
    gistModal.classList.add('hidden');
});

// Close modal on background click
gistModal.addEventListener('click', (e) => {
    if (e.target === gistModal) {
        gistModal.classList.add('hidden');
    }
});
