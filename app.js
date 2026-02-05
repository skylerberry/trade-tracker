// Trade Tracker App

// =====================
// Lazy Loading Utilities
// =====================

// Cache for loaded libraries
const loadedLibraries = {
    jspdf: false,
    html2canvas: false
};

// Dynamically load a script and return a promise
function loadScript(src) {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.body.appendChild(script);
    });
}

// Lazy load jsPDF + autoTable (for PDF export)
async function loadJsPDF() {
    if (loadedLibraries.jspdf) return;

    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.1/jspdf.plugin.autotable.min.js');
    loadedLibraries.jspdf = true;
}

// Lazy load html2canvas (for trade card export)
async function loadHtml2Canvas() {
    if (loadedLibraries.html2canvas) return;

    await loadScript('https://html2canvas.hertzen.com/dist/html2canvas.min.js');
    loadedLibraries.html2canvas = true;
}

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
const tableContainer = document.querySelector('.table-container');

// State
let trades = [];
let editingId = null;
let datePickers = {};
let undoStack = [];
let saleCount = 0;
const MAX_UNDO = 50;
let watchlist = [];
let pendingSnapshot = null; // Snapshot data when adding trade from calculator
let pendingSellPlan = null; // Sell plan data when adding trade from calculator

// Pagination
const TRADES_PER_PAGE = 10;
let currentPage = 1;

// Date filter
let dateFilterRange = null; // { from: Date, to: Date } or null for all dates

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
    initQuickSellModal();
    initFreerollToggle();

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

    // Date range filter for trades table
    datePickers.dateFilter = flatpickr('#dateFilter', {
        mode: 'range',
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'j M Y',
        onChange: function(selectedDates) {
            if (selectedDates.length === 2) {
                dateFilterRange = {
                    from: selectedDates[0],
                    to: selectedDates[1]
                };
                currentPage = 1;
                renderTrades();
            } else if (selectedDates.length === 0) {
                dateFilterRange = null;
                currentPage = 1;
                renderTrades();
            }
        }
    });

    // Clear date filter button
    document.getElementById('clearDateFilter')?.addEventListener('click', () => {
        datePickers.dateFilter.clear();
        dateFilterRange = null;
        currentPage = 1;
        renderTrades();
    });

    // Quick Sell Modal date picker
    datePickers.qsDate = flatpickr('#qsDate', {
        ...flatpickrConfig,
        defaultDate: new Date()
    });
}

// Initialize Quick Sell Modal event listeners
function initQuickSellModal() {
    const sharesInput = document.getElementById('qsShares');
    const priceInput = document.getElementById('qsPrice');
    const useTargetBtn = document.getElementById('qsUseTarget');

    // Update profit preview when inputs change
    sharesInput?.addEventListener('input', () => {
        const trade = trades.find(t => t.id === quickSellTradeId);
        if (trade) updateQuickSellProfit(trade.entryPrice);
    });

    priceInput?.addEventListener('input', () => {
        const trade = trades.find(t => t.id === quickSellTradeId);
        if (trade) updateQuickSellProfit(trade.entryPrice);
    });

    // Use target price button
    useTargetBtn?.addEventListener('click', () => {
        const trade = trades.find(t => t.id === quickSellTradeId);
        if (!trade || !trade.sellPlan) return;
        const target = trade.sellPlan.targets.find(t => t.rLevel === quickSellRLevel);
        if (target) {
            priceInput.value = target.targetPrice.toFixed(2);
            updateQuickSellProfit(trade.entryPrice);
        }
    });
}

// Sales management
const salesContainer = document.getElementById('salesContainer');
const addSaleBtn = document.getElementById('addSaleBtn');

// R-level defaults: Sale 1 = 1R @ 1/2, Sale 2 = 2R @ 1/3, Sale 3 = 3R @ 1/4
const SALE_DEFAULTS = {
    1: { portion: '1/2', rLevel: 1 },
    2: { portion: '1/3', rLevel: 2 },
    3: { portion: '1/4', rLevel: 3 }
};

function calculateRLevelPrice(entry, stop, rLevel) {
    // R = entry + (entry - stop) * rLevel
    const riskPerShare = entry - stop;
    return entry + (riskPerShare * rLevel);
}

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
    } else {
        // Auto-fill defaults based on sale number (only for new sales, not editing)
        const saleNumber = salesContainer.querySelectorAll('.sale-row').length;
        const defaults = SALE_DEFAULTS[saleNumber];

        if (defaults) {
            // Set default portion
            document.getElementById(`sale${saleId}Portion`).value = defaults.portion;

            // Calculate and set R-level price if entry and stop are available
            const entry = parseFloat(document.getElementById('entryPrice').value);
            const stop = parseFloat(document.getElementById('initialSL').value);

            if (entry && stop && entry > stop) {
                const rPrice = calculateRLevelPrice(entry, stop, defaults.rLevel);
                document.getElementById(`sale${saleId}Price`).value = rPrice.toFixed(2);
            }
        }
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
statusFilter.addEventListener('change', () => {
    currentPage = 1; // Reset to first page when filter changes
    renderTrades();
});

// Journal entry type constants
const JOURNAL_TYPES = {
    ENTRY_THESIS: 'entry_thesis',
    DURING_TRADE: 'during_trade',
    EXIT_REVIEW: 'exit_review',
    LESSONS_LEARNED: 'lessons_learned'
};

const JOURNAL_TYPE_LABELS = {
    [JOURNAL_TYPES.ENTRY_THESIS]: 'Entry Thesis',
    [JOURNAL_TYPES.DURING_TRADE]: 'During Trade',
    [JOURNAL_TYPES.EXIT_REVIEW]: 'Exit Review',
    [JOURNAL_TYPES.LESSONS_LEARNED]: 'Lessons Learned'
};

const JOURNAL_TYPE_COLORS = {
    [JOURNAL_TYPES.ENTRY_THESIS]: 'blue',
    [JOURNAL_TYPES.DURING_TRADE]: 'amber',
    [JOURNAL_TYPES.EXIT_REVIEW]: 'green',
    [JOURNAL_TYPES.LESSONS_LEARNED]: 'purple'
};

// Migrate trade to add new fields (archive & journal)
function migrateTrade(trade) {
    // Add archived fields if missing
    if (trade.archived === undefined) {
        trade.archived = false;
    }
    if (trade.archivedAt === undefined) {
        trade.archivedAt = null;
    }
    // Add journal array if missing
    if (!Array.isArray(trade.journal)) {
        trade.journal = [];
    }
    return trade;
}

// Load trades from localStorage
function loadTrades() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            trades = JSON.parse(stored);
            // Migrate all trades to ensure they have new fields
            trades = trades.map(migrateTrade);
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

    // Include snapshot if available (from calculator) and not editing
    if (pendingSnapshot && !editingId) {
        trade.snapshot = pendingSnapshot;
    }

    // Include sell plan if available (from calculator) and not editing
    if (pendingSellPlan && !editingId) {
        trade.sellPlan = pendingSellPlan;
    }

    if (editingId) {
        const index = trades.findIndex(t => t.id === editingId);
        if (index !== -1) {
            // Preserve existing snapshot and sell plan when editing
            const existingSnapshot = trades[index].snapshot;
            const existingSellPlan = trades[index].sellPlan;
            trades[index] = trade;
            if (existingSnapshot) {
                trades[index].snapshot = existingSnapshot;
            }
            if (existingSellPlan) {
                trades[index].sellPlan = existingSellPlan;
            }
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
    pendingSnapshot = null;
    pendingSellPlan = null;
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
    if (!sale || (!sale.portion && !sale.shares) || !sale.price) {
        return forHtml ? '<span class="sale-empty">-</span>' : '-';
    }
    const dateStr = sale.date ? ` ${formatShortDate(sale.date)}` : '';
    // Handle "remaining" portion - show shares count if available
    let portionStr = sale.portion;
    if (sale.portion === 'remaining' && sale.shares) {
        portionStr = `${sale.shares} shares`;
    }
    return `${portionStr} @ ${sale.price.toFixed(2)}${dateStr}`;
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
function formatStatus(status, trade = null) {
    const badgeHtml = `<span class="status-badge status-${status}">${STATUS_LABELS[status] || status}</span>`;

    // Add sell plan progress dots if trade has a sell plan
    if (trade && trade.sellPlan && trade.sellPlan.enabled) {
        const dotsHtml = renderSellProgressDots(trade);
        return `<div class="status-with-dots">${badgeHtml}${dotsHtml}</div>`;
    }

    return badgeHtml;
}

// Render sell progress dots for table row
function renderSellProgressDots(trade) {
    if (!trade.sellPlan || !trade.sellPlan.targets) return '';

    // Don't show dots for closed trades - the position is done
    const isClosed = trade.status === STATUS.CLOSED || trade.status === STATUS.STOPPED_OUT;
    if (isClosed) return '';

    // Filter out the "exit" target - only show R-level targets
    const targets = trade.sellPlan.targets.filter(t => t.rLevel !== 'exit');
    if (targets.length === 0) return '';

    const completed = targets.filter(t => t.status === 'executed').length;
    const total = targets.length;

    // Find next pending target
    let nextIndex = targets.findIndex(t => t.status !== 'executed' && t.status !== 'skipped');

    const dots = targets.map((target, i) => {
        let dotClass = 'sp-dot';
        if (target.status === 'executed') {
            dotClass += ' completed';
        } else if (i === nextIndex) {
            dotClass += ' next';
        }
        return `<span class="${dotClass}"></span>`;
    }).join('');

    return `<div class="sell-progress-dots" title="${completed}/${total} R-levels hit">${dots}</div>`;
}

// Generate action buttons based on trade state
function renderTradeActions(trade) {
    const isArchived = trade.archived;
    const isTerminal = trade.status === STATUS.CLOSED || trade.status === STATUS.STOPPED_OUT;

    // Archived trades: View (eye) | Restore | Delete
    if (isArchived) {
        return `
            <button class="btn-icon btn-view" onclick="manageTrade('${trade.id}')" data-tooltip="View">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            </button>
            <button class="btn-icon btn-restore" onclick="restoreTrade('${trade.id}')" data-tooltip="Restore">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                    <path d="M3 3v5h5"></path>
                </svg>
            </button>
            <button class="btn-icon btn-delete" onclick="deleteTrade('${trade.id}')" data-tooltip="Delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        `;
    }

    // Terminal trades (closed, stopped_out) - NOT archived: Manage | Edit | Archive | Delete
    if (isTerminal) {
        return `
            <button class="btn-icon btn-manage" onclick="manageTrade('${trade.id}')" data-tooltip="Manage">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
            </button>
            <button class="btn-icon btn-edit" onclick="editTrade('${trade.id}')" data-tooltip="Edit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </button>
            <button class="btn-icon btn-archive" onclick="archiveTrade('${trade.id}')" data-tooltip="Archive">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="21 8 21 21 3 21 3 8"></polyline>
                    <rect x="1" y="3" width="22" height="5"></rect>
                    <line x1="10" y1="12" x2="14" y2="12"></line>
                </svg>
            </button>
            <button class="btn-icon btn-delete" onclick="deleteTrade('${trade.id}')" data-tooltip="Delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        `;
    }

    // Active trades (open, partially_closed): Manage | Edit | Delete
    return `
        <button class="btn-icon btn-manage" onclick="manageTrade('${trade.id}')" data-tooltip="Manage">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
        </button>
        <button class="btn-icon btn-edit" onclick="editTrade('${trade.id}')" data-tooltip="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
        </button>
        <button class="btn-icon btn-delete" onclick="deleteTrade('${trade.id}')" data-tooltip="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        </button>
    `;
}

// Render trades table
function renderTrades() {
    const filter = statusFilter.value;
    let filteredTrades = trades;

    // Filter by status - handle archived filter separately
    if (filter === 'archived') {
        filteredTrades = filteredTrades.filter(t => t.archived === true);
    } else if (filter !== 'all') {
        // For other filters, exclude archived trades and filter by status
        filteredTrades = filteredTrades.filter(t => !t.archived && t.status === filter);
    } else {
        // "All Active" - show all non-archived trades
        filteredTrades = filteredTrades.filter(t => !t.archived);
    }

    // Filter by date range
    if (dateFilterRange) {
        filteredTrades = filteredTrades.filter(t => {
            const tradeDate = new Date(t.entryDate);
            // Set time to start/end of day for proper comparison
            const fromDate = new Date(dateFilterRange.from);
            fromDate.setHours(0, 0, 0, 0);
            const toDate = new Date(dateFilterRange.to);
            toDate.setHours(23, 59, 59, 999);
            return tradeDate >= fromDate && tradeDate <= toDate;
        });
    }

    // Sort by entry date (newest first)
    filteredTrades.sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));

    if (filteredTrades.length === 0) {
        tradesTable.classList.add('hidden');
        noTradesMsg.classList.remove('hidden');
        tableContainer.classList.add('empty');
        if (filter === 'archived') {
            noTradesMsg.textContent = 'No archived trades.';
        } else if (filter === 'all') {
            noTradesMsg.textContent = 'No trades logged yet. Click "Add New Trade" to get started.';
        } else {
            noTradesMsg.textContent = `No ${STATUS_LABELS[filter] || filter} trades found.`;
        }
        hidePagination();
        updateOpenHeatDisplay();
        return;
    }

    tradesTable.classList.remove('hidden');
    noTradesMsg.classList.add('hidden');
    tableContainer.classList.remove('empty');

    // Pagination
    const totalPages = Math.ceil(filteredTrades.length / TRADES_PER_PAGE);

    // Ensure current page is valid
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * TRADES_PER_PAGE;
    const endIndex = startIndex + TRADES_PER_PAGE;
    const paginatedTrades = filteredTrades.slice(startIndex, endIndex);

    tradesBody.innerHTML = paginatedTrades.map(trade => {
        const sales = getTradeSales(trade);
        return `
        <tr data-id="${trade.id}" ${trade.archived ? 'class="archived-row"' : ''}>
            <td><strong>${trade.ticker}</strong></td>
            <td class="cell-price">${trade.entryPrice.toFixed(2)}</td>
            <td class="cell-date">${formatDate(trade.entryDate)}</td>
            <td class="cell-price">${trade.initialSL.toFixed(2)}</td>
            <td class="cell-price">${trade.currentSL.toFixed(2)}</td>
            <td class="sale-display">${formatSale(sales[0])}</td>
            <td class="sale-display">${formatSale(sales[1])}</td>
            <td class="sale-display">${formatSale(sales[2])}</td>
            <td>${formatStatus(trade.status, trade)}</td>
            <td class="actions-cell">${renderTradeActions(trade)}</td>
        </tr>
    `}).join('');

    // Update pagination controls
    updatePagination(filteredTrades.length, totalPages);

    // Update open heat indicator
    updateOpenHeatDisplay();
}

// Update pagination controls
function updatePagination(totalTrades, totalPages) {
    const paginationEl = document.getElementById('pagination');
    if (!paginationEl) return;

    if (totalPages <= 1) {
        hidePagination();
        return;
    }

    paginationEl.classList.remove('hidden');

    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('totalTrades').textContent = `${totalTrades} trades`;

    document.getElementById('prevPageBtn').disabled = currentPage === 1;
    document.getElementById('nextPageBtn').disabled = currentPage === totalPages;
}

// Hide pagination
function hidePagination() {
    const paginationEl = document.getElementById('pagination');
    if (paginationEl) paginationEl.classList.add('hidden');
}

// Pagination handlers
function goToPage(page) {
    currentPage = page;
    renderTrades();
}

function prevPage() {
    if (currentPage > 1) {
        const scrollY = window.scrollY;
        currentPage--;
        renderTrades();
        window.scrollTo(0, scrollY);
    }
}

function nextPage() {
    const scrollY = window.scrollY;
    currentPage++;
    renderTrades();
    window.scrollTo(0, scrollY);
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

// Manage trade (alias for viewTrade, used for active trades)
function manageTrade(id) {
    viewTrade(id);
}

// Archive a trade
function archiveTrade(id) {
    const trade = trades.find(t => t.id === id);
    if (!trade) return;

    if (!confirm(`Archive "${trade.ticker}"? You can restore it later from the Archived filter.`)) return;

    trade.archived = true;
    trade.archivedAt = new Date().toISOString();
    saveTrades();
    renderTrades();
    showToast(`Archived ${trade.ticker}`);
}

// Restore an archived trade
function restoreTrade(id) {
    const trade = trades.find(t => t.id === id);
    if (!trade) return;

    trade.archived = false;
    trade.archivedAt = null;
    saveTrades();
    renderTrades();
    showToast(`Restored ${trade.ticker}`);
}

// Delete all trades
document.getElementById('deleteAllTradesBtn')?.addEventListener('click', () => {
    if (trades.length === 0) {
        alert('No trades to delete.');
        return;
    }

    const count = trades.length;
    if (!confirm(`Are you sure you want to delete ALL ${count} trades?\n\nThis action cannot be undone.`)) return;

    // Double confirmation for safety
    if (!confirm(`This will permanently delete ${count} trades. Are you absolutely sure?`)) return;

    trades = [];
    currentPage = 1;
    saveTrades();
    renderTrades();
    showToast(`Deleted ${count} trades`);
});

// View trade details
let viewingTradeId = null;
const tradeDetailsModal = document.getElementById('tradeDetailsModal');

function viewTrade(id) {
    const trade = trades.find(t => t.id === id);
    if (!trade) return;

    viewingTradeId = id;

    // Populate header
    document.getElementById('detailsTicker').textContent = trade.ticker;
    document.getElementById('detailsStatus').textContent = STATUS_LABELS[trade.status] || trade.status;
    document.getElementById('detailsStatus').className = 'trade-details-status status-' + trade.status;

    // Populate trade info
    document.getElementById('detailsEntryPrice').textContent = formatCurrency(trade.entryPrice);
    document.getElementById('detailsEntryDate').textContent = formatDate(trade.entryDate);
    document.getElementById('detailsInitialSL').textContent = formatCurrency(trade.initialSL);
    document.getElementById('detailsCurrentSL').textContent = formatCurrency(trade.currentSL);

    // Populate sales
    const sales = getTradeSales(trade);
    const salesContainer = document.getElementById('detailsSales');
    const salesSection = document.getElementById('detailsSalesSection');

    if (sales.length > 0 && sales.some(s => s && (s.portion || s.price))) {
        salesSection.classList.remove('hidden');
        salesContainer.innerHTML = sales.map((sale, i) => {
            if (!sale || (!sale.portion && !sale.price)) return '';
            return `
                <div class="detail-sale-item">
                    <span class="detail-sale-label">Sale ${i + 1}</span>
                    <span class="detail-sale-value">${formatSale(sale, false)}</span>
                </div>
            `;
        }).join('');
    } else {
        salesSection.classList.add('hidden');
    }

    // Populate snapshot
    const snapshotContent = document.getElementById('snapshotContent');
    if (trade.snapshot) {
        const s = trade.snapshot;
        snapshotContent.innerHTML = `
            <div class="trade-details-grid">
                <div class="detail-item">
                    <span class="detail-label">Account Size</span>
                    <span class="detail-value">${formatCurrency(s.accountSize)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Shares</span>
                    <span class="detail-value">${formatNumber(s.shares)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Position Size</span>
                    <span class="detail-value">${formatCurrency(s.positionSize)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Risk %</span>
                    <span class="detail-value">${s.riskPercent}%</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">% of Account</span>
                    <span class="detail-value">${s.percentOfAccount.toFixed(1)}%</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Total Risk</span>
                    <span class="detail-value">${formatCurrency(s.totalRisk)}</span>
                </div>
            </div>
        `;
    } else {
        snapshotContent.innerHTML = `
            <div class="snapshot-empty">
                <p>No position data recorded for this trade.</p>
                <button class="btn btn-secondary" id="recordSnapshotBtn">Record from Calculator</button>
            </div>
        `;
        // Add click handler for record snapshot button
        document.getElementById('recordSnapshotBtn')?.addEventListener('click', () => {
            recordSnapshotForTrade(id);
        });
    }

    // Render sell plan progress if available
    if (typeof renderSellPlanProgress === 'function') {
        renderSellPlanProgress(trade);
    }

    // Render journal entries
    renderJournalEntries(trade);

    // Show/hide add entry button based on archived state
    const addEntryBtn = document.getElementById('addJournalEntryBtn');
    if (addEntryBtn) {
        addEntryBtn.classList.toggle('hidden', trade.archived);
    }

    // Reset journal form
    const journalForm = document.getElementById('journalEntryForm');
    if (journalForm) {
        journalForm.classList.add('hidden');
    }

    tradeDetailsModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// Record snapshot for existing trade from current calculator state
function recordSnapshotForTrade(tradeId) {
    if (!currentCalcState.hasValidData) {
        showToast('Enter position data in calculator first');
        return;
    }

    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return;

    const state = currentCalcState;
    const riskPerShare = state.entryPrice - state.stopLoss;

    trade.snapshot = {
        accountSize: state.accountSize,
        shares: state.shares,
        positionSize: state.positionSize,
        riskPercent: state.riskPercent,
        percentOfAccount: state.percentOfAccount,
        riskPerShare: riskPerShare,
        totalRisk: state.shares * riskPerShare
    };

    saveTrades();
    showToast('Snapshot recorded');

    // Refresh the modal
    viewTrade(tradeId);
}

// Close trade details modal
function closeTradeDetailsModal() {
    tradeDetailsModal.classList.add('hidden');
    document.body.style.overflow = '';
    viewingTradeId = null;
}

document.getElementById('closeTradeDetailsModal')?.addEventListener('click', closeTradeDetailsModal);

// =====================
// Journal System
// =====================

// Journal image limits
const JOURNAL_MAX_IMAGES = 3;
const JOURNAL_MAX_IMAGE_SIZE = 500 * 1024; // 500KB

// Pending images for current journal entry being created
let pendingJournalImages = [];

function renderJournalEntries(trade) {
    const container = document.getElementById('journalEntriesList');
    if (!container) return;

    if (!trade.journal || trade.journal.length === 0) {
        container.innerHTML = `
            <div class="journal-empty">
                <p>No journal entries yet.</p>
            </div>
        `;
        return;
    }

    // Sort entries by timestamp (newest first)
    const sortedEntries = [...trade.journal].sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
    );

    container.innerHTML = sortedEntries.map(entry => {
        const typeLabel = JOURNAL_TYPE_LABELS[entry.type] || entry.type;
        const typeColor = JOURNAL_TYPE_COLORS[entry.type] || 'gray';
        const date = new Date(entry.timestamp);
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const formattedTime = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });

        const deleteBtn = trade.archived ? '' : `
            <button class="journal-entry-delete" onclick="deleteJournalEntry('${trade.id}', '${entry.id}')" title="Delete entry">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;

        // Render images if present
        let imagesHtml = '';
        if (entry.images && entry.images.length > 0) {
            imagesHtml = `
                <div class="journal-entry-images">
                    ${entry.images.map((img, idx) => `
                        <img src="${img}" alt="Journal image ${idx + 1}" class="journal-entry-image" onclick="openJournalImage('${trade.id}', '${entry.id}', ${idx})">
                    `).join('')}
                </div>
            `;
        }

        return `
            <div class="journal-entry">
                <div class="journal-entry-header">
                    <span class="journal-entry-badge badge-${typeColor}">${typeLabel}</span>
                    <span class="journal-entry-date">${formattedDate} at ${formattedTime}</span>
                    ${deleteBtn}
                </div>
                <div class="journal-entry-content">${escapeHtml(entry.content)}</div>
                ${imagesHtml}
            </div>
        `;
    }).join('');
}

function openJournalImage(tradeId, entryId, imageIndex) {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade || !trade.journal) return;

    const entry = trade.journal.find(e => e.id === entryId);
    if (!entry || !entry.images || !entry.images[imageIndex]) return;

    // Open image in new tab
    const newTab = window.open();
    newTab.document.write(`<img src="${entry.images[imageIndex]}" style="max-width: 100%; height: auto;">`);
    newTab.document.title = 'Journal Image';
}

window.openJournalImage = openJournalImage;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addJournalEntry(tradeId, type, content, images = []) {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return;

    if (!trade.journal) {
        trade.journal = [];
    }

    const entry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        type: type,
        content: content.trim()
    };

    // Add images if present
    if (images.length > 0) {
        entry.images = images;
    }

    trade.journal.push(entry);
    saveTrades();
    renderJournalEntries(trade);
    showToast('Journal entry added');
}

function deleteJournalEntry(tradeId, entryId) {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade || !trade.journal) return;

    if (!confirm('Delete this journal entry?')) return;

    trade.journal = trade.journal.filter(e => e.id !== entryId);
    saveTrades();
    renderJournalEntries(trade);
    showToast('Entry deleted');
}

// Journal form event handlers
document.getElementById('addJournalEntryBtn')?.addEventListener('click', () => {
    const form = document.getElementById('journalEntryForm');
    if (form) {
        form.classList.remove('hidden');
        document.getElementById('journalEntryContent')?.focus();
    }
});

document.getElementById('cancelJournalEntryBtn')?.addEventListener('click', () => {
    resetJournalForm();
});

document.getElementById('saveJournalEntryBtn')?.addEventListener('click', () => {
    const type = document.getElementById('journalEntryType')?.value;
    const content = document.getElementById('journalEntryContent')?.value;

    if (!content || !content.trim()) {
        showToast('Please enter some content');
        return;
    }

    if (viewingTradeId) {
        addJournalEntry(viewingTradeId, type, content, [...pendingJournalImages]);

        // Reset and hide form
        resetJournalForm();
    }
});

function resetJournalForm() {
    const form = document.getElementById('journalEntryForm');
    if (form) {
        form.classList.add('hidden');
        document.getElementById('journalEntryContent').value = '';
        document.getElementById('journalEntryType').value = 'entry_thesis';
        pendingJournalImages = [];
        renderJournalImagePreviews();
    }
}

// Image upload handling
document.getElementById('journalAddImageBtn')?.addEventListener('click', () => {
    document.getElementById('journalImageInput')?.click();
});

document.getElementById('journalImageInput')?.addEventListener('change', (e) => {
    handleJournalImageFiles(e.target.files);
    e.target.value = ''; // Reset input so same file can be selected again
});

function handleJournalImageFiles(files) {
    if (!files || files.length === 0) return;

    const remainingSlots = JOURNAL_MAX_IMAGES - pendingJournalImages.length;
    if (remainingSlots <= 0) {
        showToast(`Maximum ${JOURNAL_MAX_IMAGES} images allowed`);
        return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);

    filesToProcess.forEach(file => {
        if (!file.type.startsWith('image/')) {
            showToast(`${file.name} is not an image`);
            return;
        }

        if (file.size > JOURNAL_MAX_IMAGE_SIZE) {
            showToast(`${file.name} exceeds 500KB limit`);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            if (pendingJournalImages.length < JOURNAL_MAX_IMAGES) {
                pendingJournalImages.push(e.target.result);
                renderJournalImagePreviews();
            }
        };
        reader.readAsDataURL(file);
    });
}

function renderJournalImagePreviews() {
    const container = document.getElementById('journalImagePreviews');
    if (!container) return;

    if (pendingJournalImages.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = pendingJournalImages.map((img, idx) => `
        <div class="journal-image-preview">
            <img src="${img}" alt="Preview ${idx + 1}">
            <button type="button" class="journal-image-remove" onclick="removeJournalImage(${idx})" title="Remove">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join('');
}

function removeJournalImage(index) {
    pendingJournalImages.splice(index, 1);
    renderJournalImagePreviews();
}

window.removeJournalImage = removeJournalImage;

// Drag and drop support for journal images
const journalForm = document.getElementById('journalEntryForm');
if (journalForm) {
    journalForm.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        journalForm.classList.add('drag-over');
    });

    journalForm.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        journalForm.classList.remove('drag-over');
    });

    journalForm.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        journalForm.classList.remove('drag-over');

        const files = e.dataTransfer?.files;
        if (files) {
            handleJournalImageFiles(files);
        }
    });
}

// Export journal functions for global access
window.deleteJournalEntry = deleteJournalEntry;
document.getElementById('closeTradeDetailsBtn')?.addEventListener('click', closeTradeDetailsModal);

// Escape key to close trade details modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !tradeDetailsModal.classList.contains('hidden')) {
        closeTradeDetailsModal();
    }
});

// Copy trade details to clipboard
document.getElementById('copyTradeDetailsBtn')?.addEventListener('click', async () => {
    if (!viewingTradeId) return;

    const trade = trades.find(t => t.id === viewingTradeId);
    if (!trade) return;

    // Build text summary
    let text = `${trade.ticker} Trade Details\n`;
    text += `${'─'.repeat(30)}\n`;
    text += `Entry: ${formatCurrency(trade.entryPrice)} on ${formatDate(trade.entryDate)}\n`;
    text += `Initial Stop: ${formatCurrency(trade.initialSL)}\n`;
    text += `Current Stop: ${formatCurrency(trade.currentSL)}\n`;
    text += `Status: ${STATUS_LABELS[trade.status] || trade.status}\n`;

    // Add sales if any
    const sales = getTradeSales(trade);
    const validSales = sales.filter(s => s && (s.portion || s.price));
    if (validSales.length > 0) {
        text += `\nSales:\n`;
        validSales.forEach((sale, i) => {
            text += `  ${i + 1}. ${formatSale(sale, false)}\n`;
        });
    }

    // Add snapshot if exists
    if (trade.snapshot) {
        const s = trade.snapshot;
        text += `\nPosition Snapshot:\n`;
        text += `  Account Size: ${formatCurrency(s.accountSize)}\n`;
        text += `  Shares: ${formatNumber(s.shares)}\n`;
        text += `  Position: ${formatCurrency(s.positionSize)}\n`;
        text += `  Risk: ${s.riskPercent}% (${formatCurrency(s.totalRisk)})\n`;
        text += `  % of Account: ${s.percentOfAccount.toFixed(1)}%\n`;
    }

    try {
        await navigator.clipboard.writeText(text);

        // Show feedback
        const btn = document.getElementById('copyTradeDetailsBtn');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');

        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 2000);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
});

// Export functions for global access (used in onclick handlers)
window.editTrade = editTrade;
window.deleteTrade = deleteTrade;
window.viewTrade = viewTrade;
window.manageTrade = manageTrade;
window.archiveTrade = archiveTrade;
window.restoreTrade = restoreTrade;
window.prevPage = prevPage;
window.nextPage = nextPage;

// PDF Export
document.getElementById('exportPdfBtn').addEventListener('click', exportToPdf);

async function exportToPdf() {
    // Get open and partially closed trades
    const openTrades = trades.filter(t => t.status === STATUS.OPEN || t.status === STATUS.PARTIALLY_CLOSED);

    if (openTrades.length === 0) {
        alert('No open trades to export.');
        return;
    }

    // Lazy load jsPDF if needed
    const btn = document.getElementById('exportPdfBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Loading...';
    btn.disabled = true;

    try {
        await loadJsPDF();
    } catch (err) {
        console.error('Failed to load PDF library:', err);
        alert('Failed to load PDF library. Please try again.');
        btn.textContent = originalText;
        btn.disabled = false;
        return;
    }

    btn.textContent = originalText;
    btn.disabled = false;

    const { jsPDF } = window.jspdf;

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
        // Load and display last sync time
        const lastSync = localStorage.getItem(LAST_SYNC_KEY);
        if (lastSync) {
            updateLastSyncedDisplay(parseInt(lastSync));
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

function formatTimeAgo(timestamp) {
    if (!timestamp) return null;

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
        return 'Just now';
    } else if (diffMins < 60) {
        return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function updateLastSyncedDisplay(timestamp) {
    // Update modal display
    const displayEl = document.getElementById('lastSyncedDisplay');
    if (displayEl) {
        displayEl.textContent = timestamp ? formatTimeAgo(timestamp) : 'Never';
    }

    // Update header display
    const headerSyncTime = document.getElementById('headerSyncTime');
    if (headerSyncTime) {
        headerSyncTime.textContent = timestamp ? formatTimeAgo(timestamp) : '';
    }
}

// Update sync status counts in the connected modal
function updateSyncStatusCounts() {
    const tradesCount = document.getElementById('syncTradesCount');
    const watchlistCount = document.getElementById('syncWatchlistCount');

    if (tradesCount) {
        tradesCount.textContent = trades.length;
    }

    if (watchlistCount) {
        watchlistCount.textContent = watchlist.length;
    }
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

        // Update sync status counts
        updateSyncStatusCounts();
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

// Delete trades button
document.getElementById('deleteTradesBtn').addEventListener('click', () => {
    if (trades.length === 0) {
        alert('No trades to delete.');
        return;
    }
    if (!confirm(`Delete all ${trades.length} trade(s)? This cannot be undone.`)) return;

    trades = [];
    saveTrades();
    renderTrades();
    updateSyncStatusCounts();
});

// Delete/reset settings button
document.getElementById('deleteSettingsBtn').addEventListener('click', () => {
    if (!confirm('Reset all settings to defaults? This will clear your account size, risk defaults, and calculator fields.')) return;

    // Reset to defaults
    accountSize = 0;
    defaultRiskPercent = 1;
    defaultMaxPercent = 100;

    // Clear localStorage
    localStorage.removeItem(CALC_ACCOUNT_KEY);
    localStorage.removeItem('tradeTracker_defaultRisk');
    localStorage.removeItem('tradeTracker_defaultMax');

    // Reset UI
    calcAccountSize.value = '';
    calcRiskPercent.value = 1;
    calcMaxPercent.value = 100;

    // Reset preset button states
    document.querySelectorAll('.risk-preset').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === '1');
    });
    document.querySelectorAll('.max-preset').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === '100');
    });

    // Clear calculator fields
    calcEntryPrice.value = '';
    calcStopLoss.value = '';
    calcTargetPrice.value = '';
    document.getElementById('calcTicker').value = '';

    calculatePosition();
    syncSettingsToGist();
    alert('Settings reset to defaults.');
});

// Delete watchlist button
document.getElementById('deleteWatchlistBtn').addEventListener('click', () => {
    if (watchlist.length === 0) {
        alert('Watchlist is already empty.');
        return;
    }
    if (!confirm(`Delete all ${watchlist.length} ticker(s) from your watchlist?`)) return;

    watchlist = [];
    saveWatchlist();
    updateSyncStatusCounts();
});

// Delete all data button
document.getElementById('deleteAllDataBtn').addEventListener('click', () => {
    if (!confirm('Delete ALL data? This will remove all trades, settings, and watchlist. This cannot be undone.')) return;
    if (!confirm('Are you sure? This is permanent.')) return;

    // Delete trades
    trades = [];
    localStorage.removeItem(STORAGE_KEY);

    // Reset settings
    accountSize = 0;
    defaultRiskPercent = 1;
    defaultMaxPercent = 100;
    localStorage.removeItem(CALC_ACCOUNT_KEY);
    localStorage.removeItem('tradeTracker_defaultRisk');
    localStorage.removeItem('tradeTracker_defaultMax');

    // Clear watchlist
    watchlist = [];
    localStorage.removeItem(WATCHLIST_KEY);

    // Reset UI
    calcAccountSize.value = '';
    calcRiskPercent.value = 1;
    calcMaxPercent.value = 100;
    calcEntryPrice.value = '';
    calcStopLoss.value = '';
    calcTargetPrice.value = '';
    document.getElementById('calcTicker').value = '';

    document.querySelectorAll('.risk-preset').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === '1');
    });
    document.querySelectorAll('.max-preset').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === '100');
    });

    calculatePosition();
    renderTrades();
    renderWatchlistPills();
    syncToGist();
    syncSettingsToGist();
    updateSyncStatusCounts();

    alert('All data deleted.');
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

    // Calculate final values (both original and limited)
    const originalRisk = shares * riskPerShare;
    const actualRisk = limitedShares * riskPerShare;
    const originalRiskPercent = (originalRisk / account) * 100;
    const actualRiskPercent = (actualRisk / account) * 100;
    const stopDistancePercent = (riskPerShare / entry) * 100;
    const originalPercentOfAccount = (positionSize / account) * 100;
    const percentOfAccount = (limitedPositionSize / account) * 100;

    // Update Position Card UI
    if (isLimited) {
        calcShares.innerHTML = `<span class="original-value">${formatNumber(shares)}</span> → ${formatNumber(limitedShares)}`;
        calcPositionSize.innerHTML = `<span class="original-value">${formatCurrency(positionSize)}</span> → ${formatCurrency(limitedPositionSize)}`;
        calcTotalRisk.innerHTML = `<span class="original-value">${formatCurrency(originalRisk)} (${originalRiskPercent.toFixed(2)}%)</span> → ${formatCurrency(actualRisk)} (${actualRiskPercent.toFixed(2)}%)`;
        calcPercentAccount.innerHTML = `<span class="original-value">${formatPercentage(originalPercentOfAccount)}</span> → ${formatPercentage(percentOfAccount)}`;
    } else {
        calcShares.textContent = formatNumber(limitedShares);
        calcPositionSize.textContent = formatCurrency(limitedPositionSize);
        calcTotalRisk.textContent = `${formatCurrency(actualRisk)} (${actualRiskPercent.toFixed(2)}%)`;
        calcPercentAccount.textContent = formatPercentage(percentOfAccount);
    }
    calcShares.classList.toggle('limited', isLimited);
    calcShares.classList.add('copyable');
    calcPositionSize.classList.toggle('limited', isLimited);
    calcTotalRisk.classList.toggle('limited', isLimited);
    calcPercentAccount.classList.toggle('limited', isLimited);
    calcStopDistance.textContent = `${formatCurrency(riskPerShare)} (${stopDistancePercent.toFixed(1)}%)`;

    // Calculate and update R-levels
    updateRLevels(entry, riskPerShare, limitedShares, target);

    // Calculate and update Target Card
    updateTargetCard(entry, riskPerShare, limitedShares, target);

    // Update export state
    if (typeof updateExportState === 'function') {
        updateExportState();
    }

    // Update sell plan preview
    if (typeof updateSellPlanPreview === 'function') {
        updateSellPlanPreview();
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
    calcShares.classList.remove('limited', 'copyable');
    calcPositionSize.textContent = '-';
    calcPositionSize.classList.remove('limited');
    calcStopDistance.textContent = '-';
    calcTotalRisk.textContent = '-';
    calcTotalRisk.classList.remove('limited');
    calcPercentAccount.textContent = '-';
    calcPercentAccount.classList.remove('limited');

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

    // Hide freeroll toggle
    const toggleContainer = document.getElementById('calcSellPlanToggle');
    if (toggleContainer) toggleContainer.classList.add('hidden');
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

// Clear calculator function
function clearCalculator() {
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
}

// Clear calculator buttons (desktop and mobile)
document.getElementById('clearCalculatorBtn')?.addEventListener('click', clearCalculator);
document.getElementById('clearCalculatorBtnMobile')?.addEventListener('click', clearCalculator);

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

// Copy shares to clipboard by clicking on the shares value
document.getElementById('calcShares').addEventListener('click', async () => {
    const sharesEl = document.getElementById('calcShares');
    const containerEl = sharesEl?.closest('.calc-big-result');
    if (!sharesEl || !sharesEl.classList.contains('copyable')) return;

    // Extract the final number (after → if limited, or the only number if not)
    const text = sharesEl.textContent;
    let value;
    if (text.includes('→')) {
        // Limited: get the number after the arrow
        value = text.split('→')[1].trim().replace(/,/g, '');
    } else {
        value = text.replace(/,/g, '').trim();
    }

    try {
        await navigator.clipboard.writeText(value);
        containerEl.classList.add('copied');
        setTimeout(() => containerEl.classList.remove('copied'), 1200);
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
    updateOpenHeatDisplay();
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

        // Check if value matches any preset
        const presetValues = [0.1, 0.25, 0.5, 1];
        const isPreset = presetValues.includes(defaultRiskPercent);

        document.querySelectorAll('.risk-preset').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.value) === defaultRiskPercent);
        });

        // If custom value, show the custom input
        if (!isPreset) {
            const customToggle = document.getElementById('customRiskToggle');
            const customWrapper = document.getElementById('customRiskWrapper');
            const customInput = document.getElementById('calcCustomRisk');

            customToggle.classList.add('hidden');
            customWrapper.classList.remove('hidden');
            customWrapper.classList.add('active');
            customInput.value = defaultRiskPercent;
        }
    }

    if (storedMax) {
        defaultMaxPercent = parseFloat(storedMax);
        calcMaxPercent.value = defaultMaxPercent;

        // Check if value matches any preset
        const maxPresetValues = [5, 10, 20, 50, 100];
        const isMaxPreset = maxPresetValues.includes(defaultMaxPercent);

        document.querySelectorAll('.max-preset').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.value) === defaultMaxPercent);
        });

        // If custom value, show the custom input
        if (!isMaxPreset) {
            const customToggle = document.getElementById('customMaxToggle');
            const customWrapper = document.getElementById('customMaxWrapper');
            const customInput = document.getElementById('calcCustomMax');

            customToggle.classList.add('hidden');
            customWrapper.classList.remove('hidden');
            customWrapper.classList.add('active');
            customInput.value = defaultMaxPercent;
        }
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
    updateOpenHeatDisplay();
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

                const presetValues = [0.1, 0.25, 0.5, 1];
                const isPreset = presetValues.includes(defaultRiskPercent);

                document.querySelectorAll('.risk-preset').forEach(btn => {
                    btn.classList.toggle('active', parseFloat(btn.dataset.value) === defaultRiskPercent);
                });

                // If custom value, show the custom input
                if (!isPreset) {
                    const customToggle = document.getElementById('customRiskToggle');
                    const customWrapper = document.getElementById('customRiskWrapper');
                    const customInput = document.getElementById('calcCustomRisk');

                    customToggle.classList.add('hidden');
                    customWrapper.classList.remove('hidden');
                    customWrapper.classList.add('active');
                    customInput.value = defaultRiskPercent;
                }
            }
            if (settings.defaultMaxPercent) {
                defaultMaxPercent = settings.defaultMaxPercent;
                localStorage.setItem('tradeTracker_defaultMax', defaultMaxPercent.toString());
                calcMaxPercent.value = defaultMaxPercent;

                const maxPresetValues = [5, 10, 20, 50, 100];
                const isMaxPreset = maxPresetValues.includes(defaultMaxPercent);

                document.querySelectorAll('.max-preset').forEach(btn => {
                    btn.classList.toggle('active', parseFloat(btn.dataset.value) === defaultMaxPercent);
                });

                // If custom value, show the custom input
                if (!isMaxPreset) {
                    const customToggle = document.getElementById('customMaxToggle');
                    const customWrapper = document.getElementById('customMaxWrapper');
                    const customInput = document.getElementById('calcCustomMax');

                    customToggle.classList.add('hidden');
                    customWrapper.classList.remove('hidden');
                    customWrapper.classList.add('active');
                    customInput.value = defaultMaxPercent;
                }
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
                // Use !== undefined to allow empty strings (cleared fields)
                if (fields.entryPrice !== undefined) calcEntryPrice.value = fields.entryPrice;
                if (fields.stopLoss !== undefined) calcStopLoss.value = fields.stopLoss;
                if (fields.ticker !== undefined) document.getElementById('calcTicker').value = fields.ticker;
                if (fields.targetPrice !== undefined) calcTargetPrice.value = fields.targetPrice;
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

    // Update button states on initial load
    updateExportState();
});

// ============================================
// Paste Alert Feature
// ============================================

// Discord Alert Parser
function parseDiscordAlert(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        throw new Error('Please paste a Discord alert first');
    }

    const text = rawText.trim();

    // Helper function to convert string to number, removing commas
    const toNumber = (str) => {
        const cleaned = String(str).replace(/[, ]+/g, '');
        return parseFloat(cleaned);
    };

    // Helper function to extract and normalize ticker
    const extractTicker = (text) => {
        const tickerMatch = text.match(/\$([A-Z0-9.-]+)/i);
        if (tickerMatch) {
            return tickerMatch[1].toUpperCase();
        }
        return null;
    };

    // Regex patterns to match various Discord alert formats
    const patterns = [
        // Pattern 1: Standard format
        {
            entry: /(?:adding|add|starter).*?(?:\$[A-Z]+)?.*?@\s*\$?([0-9,]+\.?[0-9]*)/i,
            stop: /(?:stop\s*(?:loss)?|sl).*?@\s*\$?([0-9,]+\.?[0-9]*)/i,
            risk: /(?:risk(?:ing)?)[^\d]*?([0-9]+(?:\.[0-9]+)?)\s*%/i
        },
        // Pattern 2: Multi-line format
        {
            entry: /(?:adding|add|starter)[\s\S]*?@\s*\$?([0-9,]+\.?[0-9]*)/i,
            stop: /(?:stop[\s\S]*?loss|sl)[\s\S]*?@\s*\$?([0-9,]+\.?[0-9]*)/i,
            risk: /(?:risk(?:ing)?)[\s\S]*?([0-9]+(?:\.[0-9]+)?)\s*%/i
        }
    ];

    let entry, stop, riskPct, ticker;

    // Extract ticker first
    ticker = extractTicker(text);

    // Try each pattern until we find a match
    for (const pattern of patterns) {
        const entryMatch = text.match(pattern.entry);
        const stopMatch = text.match(pattern.stop);
        const riskMatch = text.match(pattern.risk);

        if (entryMatch) entry = toNumber(entryMatch[1]);
        if (stopMatch) stop = toNumber(stopMatch[1]);
        if (riskMatch) riskPct = parseFloat(riskMatch[1]);

        // If we found both required values, break
        if (!isNaN(entry) && !isNaN(stop)) {
            break;
        }
    }

    // Validation
    if (isNaN(entry) || entry <= 0) {
        throw new Error('Could not find a valid entry price. Look for "Adding @ $XX.XX" format.');
    }

    if (isNaN(stop) || stop <= 0) {
        throw new Error('Could not find a valid stop loss. Look for "Stop loss @ $XX.XX" format.');
    }

    if (stop >= entry) {
        throw new Error('Stop loss must be below entry price (long positions only).');
    }

    if (riskPct !== undefined) {
        if (isNaN(riskPct) || riskPct <= 0 || riskPct > 100) {
            throw new Error('Risk percentage must be between 0 and 100.');
        }

        if (riskPct > 10) {
            throw new Error('Risk percentage seems high (>10%). Please verify.');
        }
    }

    return {
        entry: entry,
        stop: stop,
        riskPct: riskPct,
        ticker: ticker
    };
}

// Toast notification system
function ensureToastHost() {
    if (!document.getElementById('toastHost')) {
        const host = document.createElement('div');
        host.id = 'toastHost';
        document.body.appendChild(host);
    }
}

function showToast(message) {
    ensureToastHost();
    const host = document.getElementById('toastHost');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
        el.classList.remove('visible');
        setTimeout(() => el.remove(), 250);
    }, 3500);
}

// Paste Alert Modal
const pasteAlertModal = document.getElementById('pasteAlertModal');
const pasteAlertBtn = document.getElementById('pasteAlertBtn');
const closePasteAlertModalBtn = document.getElementById('closePasteAlertModal');
const cancelPasteAlertBtn = document.getElementById('cancelPasteAlertBtn');
const importAlertBtn = document.getElementById('importAlertBtn');
const pasteAlertInput = document.getElementById('pasteAlertInput');
const pasteAlertError = document.getElementById('pasteAlertError');

function openPasteAlertModal() {
    pasteAlertInput.value = '';
    pasteAlertError.classList.add('hidden');
    pasteAlertError.textContent = '';
    pasteAlertInput.classList.remove('error');
    importAlertBtn.disabled = true;
    pasteAlertModal.classList.remove('hidden');
    pasteAlertInput.focus();
}

function closePasteAlertModalFn() {
    pasteAlertModal.classList.add('hidden');
}

function showPasteAlertError(msg) {
    pasteAlertInput.classList.add('error');
    pasteAlertError.textContent = msg;
    pasteAlertError.classList.remove('hidden');
}

function clearPasteAlertError() {
    pasteAlertInput.classList.remove('error');
    pasteAlertError.textContent = '';
    pasteAlertError.classList.add('hidden');
}

function applyAlertToCalculator(data) {
    // Apply ticker
    if (data.ticker) {
        const tickerInput = document.getElementById('calcTicker');
        if (tickerInput) {
            tickerInput.value = data.ticker;
            tickerInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // Apply entry price
    calcEntryPrice.value = Number(data.entry).toFixed(2);
    calcEntryPrice.dispatchEvent(new Event('input', { bubbles: true }));

    // Apply stop loss
    calcStopLoss.value = Number(data.stop).toFixed(2);
    calcStopLoss.dispatchEvent(new Event('input', { bubbles: true }));

    // Apply risk percentage if provided
    if (data.riskPct !== undefined) {
        // Find and click the matching preset button, or use custom
        const presetBtns = document.querySelectorAll('.risk-preset');
        let matched = false;
        presetBtns.forEach(btn => {
            if (parseFloat(btn.dataset.value) === data.riskPct) {
                btn.click();
                matched = true;
            }
        });

        if (!matched) {
            // Use custom risk input
            const customToggle = document.getElementById('customRiskToggle');
            const customInput = document.getElementById('calcCustomRisk');
            if (customToggle && customInput) {
                customToggle.click();
                customInput.value = data.riskPct;
                customInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    // Expand calculator if collapsed
    if (calculatorPanel.classList.contains('hidden')) {
        calculatorPanel.classList.remove('hidden');
        toggleCalculatorBtn.textContent = '- Hide Calculator';
        localStorage.setItem(CALC_EXPANDED_KEY, 'true');
    }

    // Scroll to show calc fields and position card after paste
    setTimeout(() => {
        const inputsRow = document.querySelector('.calc-inputs-row');
        if (inputsRow) {
            inputsRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 150);
}

// Smart paste - try clipboard first, fall back to modal
async function onSmartPaste() {
    try {
        if (!navigator.clipboard?.readText) {
            showToast('Clipboard not available — opening paste box');
            openPasteAlertModal();
            return;
        }
        const txt = (await navigator.clipboard.readText())?.trim();
        if (!txt) {
            showToast('Clipboard empty — paste your alert');
            openPasteAlertModal();
            return;
        }
        const parsed = parseDiscordAlert(txt);
        applyAlertToCalculator(parsed);
        showToast('Alert imported! ⚡');
    } catch (err) {
        showToast('Couldn\'t parse — opening editor');
        openPasteAlertModal();
        // Try to prefill with clipboard content
        try {
            const txt = (await navigator.clipboard.readText())?.trim();
            if (txt) {
                pasteAlertInput.value = txt;
                pasteAlertInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        } catch { /* ignore */ }
    }
}

// Event listeners for paste alert
pasteAlertBtn.addEventListener('click', onSmartPaste);
closePasteAlertModalBtn.addEventListener('click', closePasteAlertModalFn);
cancelPasteAlertBtn.addEventListener('click', closePasteAlertModalFn);

pasteAlertModal.addEventListener('click', (e) => {
    if (e.target === pasteAlertModal) {
        closePasteAlertModalFn();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pasteAlertModal.classList.contains('hidden')) {
        closePasteAlertModalFn();
    }
});

// Validate textarea input
pasteAlertInput.addEventListener('input', () => {
    const text = pasteAlertInput.value.trim();
    if (!text) {
        importAlertBtn.disabled = true;
        clearPasteAlertError();
        return;
    }
    try {
        parseDiscordAlert(text);
        clearPasteAlertError();
        importAlertBtn.disabled = false;
    } catch (e) {
        showPasteAlertError(e.message);
        importAlertBtn.disabled = true;
    }
});

// Import button
importAlertBtn.addEventListener('click', () => {
    const text = pasteAlertInput.value.trim();
    if (!text) return;
    try {
        const parsed = parseDiscordAlert(text);
        applyAlertToCalculator(parsed);
        showToast('Alert imported ✓');
        closePasteAlertModalFn();
    } catch (e) {
        showPasteAlertError(e.message);
    }
});

// ============================================
// Watchlist Feature
// ============================================

// Watchlist DOM elements
const watchlistSection = document.getElementById('watchlistSection');
const watchlistToggle = document.getElementById('watchlistToggle');
const watchlistContent = document.getElementById('watchlistContent');
const watchlistCountEl = document.getElementById('watchlistCount');

// Watchlist expand/collapse
const WATCHLIST_EXPANDED_KEY = 'tradeTracker_watchlistExpanded';

function toggleWatchlist() {
    const isExpanded = watchlistSection.classList.toggle('expanded');
    watchlistContent.classList.toggle('collapsed', !isExpanded);
    localStorage.setItem(WATCHLIST_EXPANDED_KEY, isExpanded.toString());
}

watchlistToggle.addEventListener('click', toggleWatchlist);

// Initialize watchlist expanded state
function initWatchlistExpandedState() {
    const stored = localStorage.getItem(WATCHLIST_EXPANDED_KEY);
    if (stored === 'true') {
        watchlistSection.classList.add('expanded');
        watchlistContent.classList.remove('collapsed');
    }
}
initWatchlistExpandedState();
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
        } catch (e) {
            console.error('Failed to parse watchlist:', e);
            watchlist = [];
        }
    }
    // Always render to show quick-add input
    renderWatchlistPills();
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
    // Update count badge
    watchlistCountEl.textContent = watchlist.length;

    const pillsHtml = watchlist.length > 0
        ? watchlist.map(ticker => `<button class="watchlist-pill" data-ticker="${ticker}" title="Click to fill ticker, Shift+Click to open TradingView">${ticker}<span class="pill-remove" data-ticker="${ticker}">×</span></button>`).join('')
        : '';

    const clearBtnHtml = watchlist.length > 0
        ? '<button class="watchlist-clear" id="clearWatchlist">× Clear</button>'
        : '';

    watchlistContent.innerHTML = `
        ${pillsHtml}
        <input type="text" id="watchlistQuickAdd" class="watchlist-quick-add" placeholder="+ Add" maxlength="5" enterkeyhint="done" autocomplete="off">
        ${clearBtnHtml}
    `;

    // Quick-add input handler
    const quickAddInput = document.getElementById('watchlistQuickAdd');
    if (quickAddInput) {
        quickAddInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const ticker = quickAddInput.value.trim().toUpperCase();
                if (ticker && !watchlist.includes(ticker) && watchlist.length < 20) {
                    watchlist.push(ticker);
                    saveWatchlist();
                    // Re-focus the new input after render
                    setTimeout(() => {
                        document.getElementById('watchlistQuickAdd')?.focus();
                    }, 0);
                } else if (watchlist.includes(ticker)) {
                    // Already exists - just clear input
                    quickAddInput.value = '';
                } else if (watchlist.length >= 20) {
                    showToast('Watchlist full (max 20)');
                }
            } else if (e.key === 'Tab' && !e.shiftKey) {
                // Keep focus on the input for quick successive adds
                e.preventDefault();
                quickAddInput.focus();
            }
        });
    }

    // Add click listeners to pills
    watchlistContent.querySelectorAll('.watchlist-pill').forEach(pill => {
        // iOS keyboard trick: focus proxy input on touchstart to "prime" the keyboard
        pill.addEventListener('touchstart', () => {
            const proxyInput = document.getElementById('iosKeyboardProxy');
            if (proxyInput) {
                proxyInput.focus();
            }
        }, { passive: true });

        pill.addEventListener('click', (e) => {
            const ticker = pill.dataset.ticker;

            // Click on × removes the ticker
            if (e.target.classList.contains('pill-remove')) {
                e.stopPropagation();
                watchlist = watchlist.filter(t => t !== ticker);
                saveWatchlist();
                return;
            }

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
        .slice(0, 20); // Max 20 tickers
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

    // Enable/disable Add to Tracker button
    const addToTrackerBtn = document.getElementById('addToTrackerBtn');
    if (addToTrackerBtn) {
        addToTrackerBtn.disabled = !hasValidData;
    }

    // Enable/disable ticker chart link button
    const openTickerChartBtn = document.getElementById('openTickerChart');
    if (openTickerChartBtn) {
        openTickerChartBtn.disabled = !hasTicker;
    }

    // Enable/disable sell plan toggle
    const sellPlanToggle = document.getElementById('sellPlanToggle');
    if (sellPlanToggle) {
        sellPlanToggle.disabled = !hasValidData;
    }

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

    // Update card content (always shown)
    document.getElementById('cardTicker').textContent = state.ticker;
    document.getElementById('cardDate').textContent = formatCardDate(new Date());
    document.getElementById('cardEntry').textContent = formatCurrency(state.entryPrice);
    document.getElementById('cardStop').textContent = formatCurrency(state.stopLoss);
    document.getElementById('cardRisk').textContent = state.riskPercent + '%';

    // Elements for mode switching
    const mainNormal = document.getElementById('cardMainNormal');
    const mainPrivacy = document.getElementById('cardMainPrivacy');
    const percentAccountRow = document.getElementById('cardPercentAccountRow');
    const accountRowEl = document.getElementById('cardAccountRow');

    if (privacyMode) {
        tradeCardPreview.classList.add('privacy-mode');
        // Hide normal main, show privacy main
        mainNormal.classList.add('hidden');
        mainPrivacy.classList.remove('hidden');
        document.getElementById('cardPercentAccountMain').textContent = state.percentOfAccount.toFixed(1) + '%';
        // Hide duplicate % of account row and account footer
        percentAccountRow.style.display = 'none';
        accountRowEl.style.display = 'none';
    } else {
        tradeCardPreview.classList.remove('privacy-mode');
        // Show normal main, hide privacy main
        mainNormal.classList.remove('hidden');
        mainPrivacy.classList.add('hidden');
        document.getElementById('cardShares').textContent = formatNumber(state.shares);
        document.getElementById('cardPosition').textContent = formatCurrency(state.positionSize) + ' position';
        // Show % of account row and account footer
        percentAccountRow.style.display = '';
        document.getElementById('cardPercentAccount').textContent = state.percentOfAccount.toFixed(1) + '%';
        accountRowEl.style.display = '';
        document.getElementById('cardAccount').textContent = formatCurrency(state.accountSize);
    }
}

// Open export modal
exportTradeCardBtn.addEventListener('click', () => {
    if (!currentCalcState.hasValidData) return;

    updateTradeCardPreview();
    exportModal.classList.remove('hidden');
});

// Add to Tracker - populate trade form with calculator values
document.getElementById('addToTrackerBtn')?.addEventListener('click', () => {
    if (!currentCalcState.hasValidData) return;

    const state = currentCalcState;

    // Reset form and set to add mode
    resetForm();
    editingId = null;
    formTitle.textContent = 'Add New Trade';

    // Store snapshot data to be saved with the trade
    const riskPerShare = state.entryPrice - state.stopLoss;
    pendingSnapshot = {
        accountSize: state.accountSize,
        shares: state.shares,
        positionSize: state.positionSize,
        riskPercent: state.riskPercent,
        percentOfAccount: state.percentOfAccount,
        riskPerShare: riskPerShare,
        totalRisk: state.shares * riskPerShare
    };

    // Store sell plan if enabled
    if (sellPlanEnabled) {
        pendingSellPlan = generateSellPlan(state.shares, state.entryPrice, state.stopLoss);
    } else {
        pendingSellPlan = null;
    }

    // Populate form fields
    document.getElementById('ticker').value = state.ticker;
    document.getElementById('entryPrice').value = state.entryPrice.toFixed(2);
    document.getElementById('initialSL').value = state.stopLoss.toFixed(2);
    document.getElementById('currentSL').value = state.stopLoss.toFixed(2);

    // Set entry date to today
    const today = new Date().toISOString().split('T')[0];
    if (datePickers.entryDate) {
        datePickers.entryDate.setDate(today, true);
    } else {
        document.getElementById('entryDate').value = today;
    }

    // Set status to open
    document.getElementById('status').value = 'open';

    // Show the form
    tradeForm.classList.remove('hidden');
    toggleFormBtn.textContent = '- Hide Form';

    // Scroll to form
    tradeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });

    showToast('Trade details added to form');
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

// Generate card image using html2canvas (lazy-loaded)
async function generateCardImage() {
    // Lazy load html2canvas if needed
    if (!loadedLibraries.html2canvas) {
        await loadHtml2Canvas();
    }

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
    const originalHTML = copyCardBtn.innerHTML;
    copyCardBtn.innerHTML = 'Loading...';
    copyCardBtn.disabled = true;

    try {
        const canvas = await generateCardImage();

        canvas.toBlob(async (blob) => {
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);

                // Show success feedback
                copyCardBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Copied!
                `;
                copyCardBtn.classList.add('btn-success');
                copyCardBtn.disabled = false;

                setTimeout(() => {
                    copyCardBtn.innerHTML = originalHTML;
                    copyCardBtn.classList.remove('btn-success');
                }, 2000);
            } catch (err) {
                console.error('Failed to copy to clipboard:', err);
                alert('Failed to copy to clipboard. Try downloading instead.');
                copyCardBtn.innerHTML = originalHTML;
                copyCardBtn.disabled = false;
            }
        }, 'image/png');
    } catch (err) {
        console.error('Failed to generate card image:', err);
        alert('Failed to generate card image.');
        copyCardBtn.innerHTML = originalHTML;
        copyCardBtn.disabled = false;
    }
});

// Download PNG
downloadCardBtn.addEventListener('click', async () => {
    const originalHTML = downloadCardBtn.innerHTML;
    downloadCardBtn.innerHTML = 'Loading...';
    downloadCardBtn.disabled = true;

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
        downloadCardBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Downloaded!
        `;
        downloadCardBtn.classList.add('btn-success');
        downloadCardBtn.disabled = false;

        setTimeout(() => {
            downloadCardBtn.innerHTML = originalHTML;
            downloadCardBtn.classList.remove('btn-success');
        }, 2000);
    } catch (err) {
        console.error('Failed to generate card image:', err);
        alert('Failed to generate card image.');
        downloadCardBtn.innerHTML = originalHTML;
        downloadCardBtn.disabled = false;
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

// ============================================
// Keyboard Shortcuts Feature
// ============================================

const SHORTCUTS_KEY = 'tradeTracker_shortcuts';

// Action definitions - maps action IDs to their label and handler
const SHORTCUT_ACTIONS = {
    'clear-calculator': {
        label: 'Clear calculator',
        action: () => clearCalculator()
    },
    'copy-entry': {
        label: 'Copy entry price',
        action: () => {
            const value = document.getElementById('calcEntryPrice').value;
            if (value) copyToClipboardWithFeedback(value, 'Entry price copied');
        }
    },
    'copy-stop': {
        label: 'Copy stop loss',
        action: () => {
            const value = document.getElementById('calcStopLoss').value;
            if (value) copyToClipboardWithFeedback(value, 'Stop loss copied');
        }
    },
    'copy-shares': {
        label: 'Copy shares',
        action: () => {
            const sharesEl = document.getElementById('calcShares');
            if (sharesEl && sharesEl.textContent !== '-') {
                const value = sharesEl.textContent.replace(/,/g, '').replace(/[^0-9]/g, '');
                if (value) copyToClipboardWithFeedback(value, 'Shares copied');
            }
        }
    },
    'toggle-calculator': {
        label: 'Toggle calculator',
        action: () => document.getElementById('toggleCalculatorBtn').click()
    },
    'open-paste-alert': {
        label: 'Open paste alert',
        action: () => document.getElementById('pasteAlertBtn').click()
    },
    'open-watchlist': {
        label: 'Open watchlist',
        action: () => document.getElementById('manageWatchlistBtn').click()
    },
    'open-export': {
        label: 'Open export modal',
        action: () => {
            const btn = document.getElementById('exportTradeCard');
            if (btn && !btn.disabled) btn.click();
        }
    },
    'toggle-theme': {
        label: 'Toggle dark mode',
        action: () => toggleTheme()
    },
    'add-trade': {
        label: 'Add new trade',
        action: () => document.getElementById('toggleFormBtn').click()
    }
};

// Stored shortcuts: { actionId: 'Ctrl+K', ... }
let shortcuts = {};
let isRecordingShortcut = false;
let recordingActionId = null;

// Helper to copy to clipboard with toast feedback
async function copyToClipboardWithFeedback(value, message) {
    try {
        await navigator.clipboard.writeText(value);
        showToast(message);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
}

// Load shortcuts from localStorage
function loadShortcuts() {
    const stored = localStorage.getItem(SHORTCUTS_KEY);
    if (stored) {
        try {
            shortcuts = JSON.parse(stored);
        } catch (e) {
            console.error('Failed to parse shortcuts:', e);
            shortcuts = {};
        }
    } else {
        shortcuts = {};
    }
}

// Save shortcuts to localStorage and sync to Gist
function saveShortcuts() {
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts));
    syncSettingsToGist();
}

// Parse shortcut string to components
function parseShortcut(shortcutStr) {
    const parts = shortcutStr.split('+');
    const key = parts[parts.length - 1].toLowerCase();
    return {
        ctrl: parts.includes('Ctrl') || parts.includes('Cmd'),
        shift: parts.includes('Shift'),
        alt: parts.includes('Alt'),
        key: key
    };
}

// Check if a keyboard event matches a shortcut string
function matchesShortcut(event, shortcutStr) {
    const shortcut = parseShortcut(shortcutStr);
    const modifierMatch =
        (event.ctrlKey || event.metaKey) === shortcut.ctrl &&
        event.shiftKey === shortcut.shift &&
        event.altKey === shortcut.alt;
    return modifierMatch && event.key.toLowerCase() === shortcut.key;
}

// Build shortcut string from keyboard event
function buildShortcutString(event) {
    const parts = [];

    // Use Cmd on Mac, Ctrl elsewhere
    if (event.metaKey) {
        parts.push('Cmd');
    } else if (event.ctrlKey) {
        parts.push('Ctrl');
    }

    if (event.shiftKey) parts.push('Shift');
    if (event.altKey) parts.push('Alt');

    // Only accept if there's at least one modifier
    if (parts.length === 0) return null;

    // Get the key - accept letters, numbers, and some special keys
    let key = event.key;

    // Normalize special keys
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();
    else if (['Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
        // Keep these as-is
    } else {
        // Don't accept other keys
        return null;
    }

    // Don't allow standalone modifier keys
    if (['Control', 'Meta', 'Shift', 'Alt'].includes(key)) return null;

    parts.push(key);
    return parts.join('+');
}

// Check for conflicting shortcuts
function checkShortcutConflict(shortcutStr, excludeActionId = null) {
    for (const [actionId, existingShortcut] of Object.entries(shortcuts)) {
        if (actionId !== excludeActionId && existingShortcut === shortcutStr) {
            return SHORTCUT_ACTIONS[actionId]?.label || actionId;
        }
    }
    return null;
}

// List of browser shortcuts to warn about
const BROWSER_SHORTCUTS = [
    'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+A', 'Ctrl+Z', 'Ctrl+Y',
    'Ctrl+S', 'Ctrl+P', 'Ctrl+F', 'Ctrl+N', 'Ctrl+T', 'Ctrl+W',
    'Ctrl+R', 'Ctrl+L', 'Ctrl+H', 'Ctrl+B', 'Ctrl+I', 'Ctrl+U',
    'Cmd+C', 'Cmd+V', 'Cmd+X', 'Cmd+A', 'Cmd+Z', 'Cmd+Y',
    'Cmd+S', 'Cmd+P', 'Cmd+F', 'Cmd+N', 'Cmd+T', 'Cmd+W',
    'Cmd+R', 'Cmd+L', 'Cmd+H', 'Cmd+B', 'Cmd+I', 'Cmd+U'
];

function isBrowserShortcut(shortcutStr) {
    return BROWSER_SHORTCUTS.includes(shortcutStr);
}

// Global keydown handler for shortcuts
document.addEventListener('keydown', (e) => {
    // Skip if recording a new shortcut (handled separately)
    if (isRecordingShortcut) return;

    // Skip if typing in input/textarea/select
    if (e.target.matches('input, textarea, select')) return;

    // Skip if any modal is open
    const openModals = document.querySelectorAll('.modal:not(.hidden)');
    if (openModals.length > 0) return;

    // Check each shortcut
    for (const [actionId, shortcutStr] of Object.entries(shortcuts)) {
        if (matchesShortcut(e, shortcutStr)) {
            e.preventDefault();
            SHORTCUT_ACTIONS[actionId]?.action();
            return;
        }
    }
});

// Shortcuts Modal DOM elements
const shortcutsModal = document.getElementById('shortcutsModal');
const shortcutsSettingsBtn = document.getElementById('shortcutsSettingsBtn');
const closeShortcutsModal = document.getElementById('closeShortcutsModal');
const closeShortcutsBtn = document.getElementById('closeShortcutsBtn');
const resetShortcutsBtn = document.getElementById('resetShortcutsBtn');
const shortcutsList = document.getElementById('shortcutsList');

// Render shortcuts list in modal
function renderShortcutsList() {
    const html = Object.entries(SHORTCUT_ACTIONS).map(([actionId, { label }]) => {
        const shortcutStr = shortcuts[actionId];
        const hasShortcut = !!shortcutStr;
        const isRecording = isRecordingShortcut && recordingActionId === actionId;

        return `
            <div class="shortcut-row" data-action-id="${actionId}">
                <span class="shortcut-label">${label}</span>
                <span class="shortcut-key ${isRecording ? 'recording' : ''} ${!hasShortcut && !isRecording ? 'not-set' : ''}" id="shortcut-key-${actionId}">
                    ${isRecording ? 'Press keys...' : (hasShortcut ? shortcutStr : 'Not set')}
                </span>
                <div class="shortcut-actions">
                    ${hasShortcut && !isRecording ? `
                        <button class="btn-clear-shortcut" data-action-id="${actionId}">Clear</button>
                    ` : ''}
                    ${!isRecording ? `
                        <button class="btn-record" data-action-id="${actionId}" ${isRecordingShortcut ? 'disabled' : ''}>Record</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    shortcutsList.innerHTML = html;

    // Add click listeners
    shortcutsList.querySelectorAll('.btn-record').forEach(btn => {
        btn.addEventListener('click', () => startRecording(btn.dataset.actionId));
    });

    shortcutsList.querySelectorAll('.btn-clear-shortcut').forEach(btn => {
        btn.addEventListener('click', () => clearShortcut(btn.dataset.actionId));
    });
}

// Start recording a new shortcut
function startRecording(actionId) {
    isRecordingShortcut = true;
    recordingActionId = actionId;
    renderShortcutsList();

    // Add recording keydown listener
    document.addEventListener('keydown', handleRecordKeydown);
}

// Stop recording
function stopRecording() {
    isRecordingShortcut = false;
    recordingActionId = null;
    document.removeEventListener('keydown', handleRecordKeydown);
    renderShortcutsList();
}

// Handle keydown while recording
function handleRecordKeydown(e) {
    if (!isRecordingShortcut) return;

    e.preventDefault();
    e.stopPropagation();

    // Escape cancels recording
    if (e.key === 'Escape') {
        stopRecording();
        return;
    }

    // Build shortcut string
    const shortcutStr = buildShortcutString(e);

    if (!shortcutStr) {
        // Invalid shortcut (no modifier or invalid key)
        return;
    }

    // Check for browser shortcut conflict
    if (isBrowserShortcut(shortcutStr)) {
        showToast(`${shortcutStr} is a browser shortcut - try a different combo`);
        return;
    }

    // Check for existing shortcut conflict
    const conflict = checkShortcutConflict(shortcutStr, recordingActionId);
    if (conflict) {
        showToast(`${shortcutStr} is already used for "${conflict}"`);
        return;
    }

    // Save the shortcut
    shortcuts[recordingActionId] = shortcutStr;
    saveShortcuts();
    stopRecording();
    showToast(`Shortcut set: ${shortcutStr}`);
}

// Clear a shortcut
function clearShortcut(actionId) {
    delete shortcuts[actionId];
    saveShortcuts();
    renderShortcutsList();
}

// Reset all shortcuts
function resetAllShortcuts() {
    if (!confirm('Clear all keyboard shortcuts?')) return;
    shortcuts = {};
    saveShortcuts();
    renderShortcutsList();
    showToast('All shortcuts cleared');
}

// Open shortcuts modal
function openShortcutsModal() {
    renderShortcutsList();
    shortcutsModal.classList.remove('hidden');
}

// Close shortcuts modal
function closeShortcutsModalFn() {
    if (isRecordingShortcut) {
        stopRecording();
    }
    shortcutsModal.classList.add('hidden');
}

// Event listeners for shortcuts modal
shortcutsSettingsBtn?.addEventListener('click', openShortcutsModal);
closeShortcutsModal?.addEventListener('click', closeShortcutsModalFn);
closeShortcutsBtn?.addEventListener('click', closeShortcutsModalFn);
resetShortcutsBtn?.addEventListener('click', resetAllShortcuts);

// Close modal on background click
shortcutsModal?.addEventListener('click', (e) => {
    if (e.target === shortcutsModal) {
        closeShortcutsModalFn();
    }
});

// Close modal on ESC key (when not recording)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !shortcutsModal.classList.contains('hidden') && !isRecordingShortcut) {
        closeShortcutsModalFn();
    }
});

// Initialize shortcuts on page load
document.addEventListener('DOMContentLoaded', () => {
    loadShortcuts();
});

// Update pushSettingsToGist to include shortcuts
const originalPushSettingsToGist = pushSettingsToGist;
pushSettingsToGist = async function() {
    const token = localStorage.getItem(GIST_TOKEN_KEY);
    const gistId = localStorage.getItem(GIST_ID_KEY);

    if (!token || !gistId) return;

    const settings = {
        accountSize: accountSize,
        defaultRiskPercent: defaultRiskPercent,
        defaultMaxPercent: defaultMaxPercent,
        calcExpanded: localStorage.getItem(CALC_EXPANDED_KEY) === 'true',
        watchlist: watchlist,
        shortcuts: shortcuts,
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
};

// Update loadSettingsFromGist to include shortcuts
const originalLoadSettingsFromGist = loadSettingsFromGist;
loadSettingsFromGist = async function() {
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

                const presetValues = [0.1, 0.25, 0.5, 1];
                const isPreset = presetValues.includes(defaultRiskPercent);

                document.querySelectorAll('.risk-preset').forEach(btn => {
                    btn.classList.toggle('active', parseFloat(btn.dataset.value) === defaultRiskPercent);
                });

                // If custom value, show the custom input
                if (!isPreset) {
                    const customToggle = document.getElementById('customRiskToggle');
                    const customWrapper = document.getElementById('customRiskWrapper');
                    const customInput = document.getElementById('calcCustomRisk');

                    customToggle.classList.add('hidden');
                    customWrapper.classList.remove('hidden');
                    customWrapper.classList.add('active');
                    customInput.value = defaultRiskPercent;
                }
            }
            if (settings.defaultMaxPercent) {
                defaultMaxPercent = settings.defaultMaxPercent;
                localStorage.setItem('tradeTracker_defaultMax', defaultMaxPercent.toString());
                calcMaxPercent.value = defaultMaxPercent;

                const maxPresetValues = [5, 10, 20, 50, 100];
                const isMaxPreset = maxPresetValues.includes(defaultMaxPercent);

                document.querySelectorAll('.max-preset').forEach(btn => {
                    btn.classList.toggle('active', parseFloat(btn.dataset.value) === defaultMaxPercent);
                });

                // If custom value, show the custom input
                if (!isMaxPreset) {
                    const customToggle = document.getElementById('customMaxToggle');
                    const customWrapper = document.getElementById('customMaxWrapper');
                    const customInput = document.getElementById('calcCustomMax');

                    customToggle.classList.add('hidden');
                    customWrapper.classList.remove('hidden');
                    customWrapper.classList.add('active');
                    customInput.value = defaultMaxPercent;
                }
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
            if (settings.shortcuts && typeof settings.shortcuts === 'object') {
                shortcuts = settings.shortcuts;
                localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts));
            }
            if (settings.calcFields) {
                const fields = settings.calcFields;
                // Use !== undefined to allow empty strings (cleared fields)
                if (fields.entryPrice !== undefined) calcEntryPrice.value = fields.entryPrice;
                if (fields.stopLoss !== undefined) calcStopLoss.value = fields.stopLoss;
                if (fields.ticker !== undefined) document.getElementById('calcTicker').value = fields.ticker;
                if (fields.targetPrice !== undefined) calcTargetPrice.value = fields.targetPrice;
                // Recalculate with restored values
                calculatePosition();
            }
        }
    } catch (err) {
        console.error('Failed to load settings from Gist:', err);
    } finally {
        isLoadingSettings = false;
    }
};

// ============================================
// Sell Plan Feature
// ============================================

// Default sell plan targets configuration
const DEFAULT_SELL_PLAN_TARGETS = [
    { rLevel: 1, portion: '1/2', fractionOfRemaining: 0.5 },
    { rLevel: 2, portion: '1/3', fractionOfRemaining: 1/3 },
    { rLevel: 3, portion: '1/4', fractionOfRemaining: 0.25 },
    { rLevel: 4, portion: '1/5', fractionOfRemaining: 0.2 }
];

// Calculate shares for each R-level target
function calculateSellPlanShares(initialShares, targets) {
    let remaining = initialShares;
    const result = [];

    for (const target of targets) {
        const sharesToSell = Math.floor(remaining * target.fractionOfRemaining);
        result.push({
            ...target,
            shares: sharesToSell
        });
        remaining -= sharesToSell;
    }

    return { targets: result, runner: remaining };
}

// Generate a sell plan for a given position
function generateSellPlan(shares, entry, stop) {
    if (!shares || !entry || !stop || stop >= entry) {
        return null;
    }

    const riskPerShare = entry - stop;
    const { targets, runner } = calculateSellPlanShares(shares, DEFAULT_SELL_PLAN_TARGETS);

    return {
        enabled: true,
        initialShares: shares,
        targets: targets.map(t => ({
            rLevel: t.rLevel,
            portion: t.portion,
            targetPrice: parseFloat((entry + (riskPerShare * t.rLevel)).toFixed(2)),
            plannedShares: t.shares,
            status: 'pending',
            executedDate: null,
            executedPrice: null,
            sharesSold: null
        })),
        runner: runner
    };
}

// Get current position status from a trade with sell plan
function getCurrentPosition(trade) {
    if (!trade.sellPlan || !trade.sellPlan.enabled) {
        return null;
    }

    const initial = trade.sellPlan.initialShares;
    let sold = 0;
    let completedLevels = 0;
    let nextLevel = null;

    for (const target of trade.sellPlan.targets) {
        if (target.status === 'executed') {
            sold += target.sharesSold || 0;
            completedLevels++;
        } else if (target.status === 'pending' && !nextLevel) {
            nextLevel = target;
        }
    }

    return {
        initial,
        sold,
        remaining: initial - sold,
        completedLevels,
        totalLevels: trade.sellPlan.targets.length,
        nextLevel
    };
}

// Calculate profit for a sell plan target
function calculateTargetProfit(target, entry) {
    if (!target || !entry || !target.targetPrice) return 0;
    const shares = target.sharesSold || target.plannedShares;
    return shares * (target.targetPrice - entry);
}

// Freeroll sell rules toggle
let sellPlanEnabled = true; // Default to enabled

function updateSellPlanPreview() {
    const toggleContainer = document.getElementById('calcSellPlanToggle');
    if (!toggleContainer) return;

    const shares = parseInt(calcShares.textContent.replace(/,/g, '').replace(/[^0-9]/g, '')) || 0;
    const entry = parseFloat(calcEntryPrice.value) || 0;
    const stopLoss = parseFloat(calcStopLoss.value) || 0;

    // Hide if no valid position calculated
    if (!shares || !entry || !stopLoss || stopLoss >= entry) {
        toggleContainer.classList.add('hidden');
        return;
    }

    toggleContainer.classList.remove('hidden');
}

// Initialize freeroll toggle
function initFreerollToggle() {
    const toggle = document.getElementById('sellPlanToggle');
    if (!toggle) return;

    // Set initial state
    toggle.setAttribute('aria-pressed', sellPlanEnabled ? 'true' : 'false');

    toggle.addEventListener('click', () => {
        sellPlanEnabled = !sellPlanEnabled;
        toggle.setAttribute('aria-pressed', sellPlanEnabled ? 'true' : 'false');
    });
}

// Render sell plan progress in trade details modal
function renderSellPlanProgress(trade) {
    const container = document.getElementById('sellPlanProgressSection');
    if (!container) return;

    if (!trade.sellPlan || !trade.sellPlan.enabled) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const position = getCurrentPosition(trade);
    if (!position) {
        container.classList.add('hidden');
        return;
    }

    const soldPercent = (position.sold / position.initial) * 100;
    const remainingPercent = 100 - soldPercent;

    // Build targets HTML - allow logging any pending target (not just sequential)
    const targetsHtml = trade.sellPlan.targets.map((target, index) => {
        const isCompleted = target.status === 'executed';
        const isPending = !isCompleted;
        const isExitTarget = target.rLevel === 'exit';

        let statusClass = isCompleted ? 'completed' : 'pending';
        let iconContent = isCompleted ? '✓' : (index + 1);

        // Format the level label
        let levelLabel;
        if (isExitTarget) {
            levelLabel = `Exit @ ${formatCurrency(target.targetPrice)}`;
        } else {
            levelLabel = `${target.rLevel}R @ ${formatCurrency(target.targetPrice)}`;
        }

        let resultHtml = '';
        if (isCompleted) {
            const profit = (target.sharesSold || 0) * (target.executedPrice - trade.entryPrice);
            const profitSign = profit >= 0 ? '+' : '';
            const profitClass = profit >= 0 ? 'spp-profit' : 'spp-loss';
            resultHtml = `
                <div class="spp-result">
                    <span class="${profitClass}">${profitSign}${formatCurrency(profit)}</span>
                    <span class="spp-date">${target.executedDate ? formatShortDate(target.executedDate) : ''}</span>
                </div>
            `;
        } else if (isPending && position.remaining > 0) {
            // Show Log Sale button for any pending target (flexible R-level logging)
            resultHtml = `<button class="btn-quick-sell" onclick="openQuickSellModal('${trade.id}', ${target.rLevel})">Log Sale</button>`;
        }

        return `
            <div class="spp-target ${statusClass}">
                <div class="spp-status-icon">${iconContent}</div>
                <div class="spp-info">
                    <span class="spp-level">${levelLabel}</span>
                    <span class="spp-action">${isCompleted ? 'Sold' : 'Sell'} ${target.sharesSold || target.plannedShares} shares (${target.portion})</span>
                </div>
                ${resultHtml}
            </div>
        `;
    }).join('');

    // Close position section (only show if remaining > 0 and not archived)
    const closePositionHtml = position.remaining > 0 && !trade.archived ? `
        <div class="close-position-section" id="closePositionSection">
            <div class="close-position-header">
                <span class="close-position-label">Close remaining position</span>
                <span class="close-position-remaining">${formatNumber(position.remaining)} shares @ ${formatCurrency(trade.entryPrice)} entry</span>
            </div>
            <div class="close-position-form hidden" id="closePositionForm">
                <div class="close-position-row">
                    <div class="close-position-field">
                        <label for="closePositionPrice">Exit Price <button type="button" class="btn-breakeven" onclick="setBreakevenPrice('${trade.id}')">= Breakeven</button></label>
                        <div class="input-with-icon">
                            <span class="input-icon">$</span>
                            <input type="number" id="closePositionPrice" step="0.01" placeholder="0.00">
                        </div>
                    </div>
                    <div class="close-position-field">
                        <label for="closePositionDate">Date</label>
                        <input type="date" id="closePositionDate" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                </div>
                <div class="close-position-preview" id="closePositionPreview"></div>
                <div class="close-position-actions">
                    <button type="button" class="btn btn-secondary btn-small" onclick="hideClosePositionForm()">Cancel</button>
                    <button type="button" class="btn btn-primary btn-small" onclick="executeClosePosition('${trade.id}', ${position.remaining})">Close Position</button>
                </div>
            </div>
            <button type="button" class="btn btn-outline btn-close-position" id="showClosePositionBtn" onclick="showClosePositionForm()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                Exit Remaining Position
            </button>
        </div>
    ` : '';

    container.innerHTML = `
        <h3>Position Progress</h3>
        <div class="position-overview">
            <div class="po-stat">
                <span class="po-label">Initial</span>
                <span class="po-value">${formatNumber(position.initial)}</span>
            </div>
            <div class="po-stat">
                <span class="po-label">Sold</span>
                <span class="po-value sold">${formatNumber(position.sold)}</span>
            </div>
            <div class="po-stat">
                <span class="po-label">Remaining</span>
                <span class="po-value remaining">${formatNumber(position.remaining)}</span>
            </div>
        </div>
        <div class="position-progress-bar">
            <div class="ppb-sold" style="width: ${soldPercent}%"></div>
            <div class="ppb-remaining" style="width: ${remainingPercent}%"></div>
        </div>
        <div class="sell-plan-progress">
            ${targetsHtml}
        </div>
        ${closePositionHtml}
    `;

    // Add event listener for price input to show P/L preview
    const priceInput = document.getElementById('closePositionPrice');
    if (priceInput) {
        priceInput.addEventListener('input', () => {
            updateClosePositionPreview(trade, position.remaining);
        });
    }
}

// Quick Sell Modal
let quickSellTradeId = null;
let quickSellRLevel = null;

function openQuickSellModal(tradeId, rLevel) {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade || !trade.sellPlan) return;

    const target = trade.sellPlan.targets.find(t => t.rLevel === rLevel);
    if (!target) return;

    quickSellTradeId = tradeId;
    quickSellRLevel = rLevel;

    const position = getCurrentPosition(trade);
    const remaining = position ? position.remaining : 0;

    const modal = document.getElementById('quickSellModal');
    if (!modal) return;

    // Populate modal
    document.getElementById('qsTicker').textContent = trade.ticker;
    document.getElementById('qsRLevel').textContent = `${rLevel}R`;
    document.getElementById('qsTargetPrice').textContent = formatCurrency(target.targetPrice);
    document.getElementById('qsShares').value = target.plannedShares;
    document.getElementById('qsRemaining').textContent = formatNumber(remaining);
    document.getElementById('qsPrice').value = target.targetPrice.toFixed(2);
    document.getElementById('qsTargetBtn').textContent = formatCurrency(target.targetPrice);

    // Set date to today
    const today = new Date().toISOString().split('T')[0];
    if (datePickers.qsDate) {
        datePickers.qsDate.setDate(today);
    } else {
        document.getElementById('qsDate').value = today;
    }

    // Update profit preview
    updateQuickSellProfit(trade.entryPrice);

    // Update portion presets
    updateQuickSellPresets(remaining, target.plannedShares);

    modal.classList.remove('hidden');
}

function updateQuickSellProfit(entryPrice) {
    const shares = parseInt(document.getElementById('qsShares')?.value) || 0;
    const price = parseFloat(document.getElementById('qsPrice')?.value) || 0;
    const profit = shares * (price - entryPrice);

    const profitEl = document.getElementById('qsProfitPreview');
    if (profitEl) {
        profitEl.textContent = profit >= 0 ? `+${formatCurrency(profit)}` : formatCurrency(profit);
        profitEl.classList.toggle('negative', profit < 0);
    }
}

function updateQuickSellPresets(remaining, suggested) {
    const presetsContainer = document.getElementById('qsPresets');
    if (!presetsContainer) return;

    const presets = [
        { label: '1/3', shares: Math.floor(remaining / 3) },
        { label: '1/4', shares: Math.floor(remaining / 4) },
        { label: '1/2', shares: Math.floor(remaining / 2) },
        { label: 'All', shares: remaining }
    ];

    presetsContainer.innerHTML = presets.map(p => `
        <button type="button" class="qs-preset ${p.shares === suggested ? 'active' : ''}" data-shares="${p.shares}">
            ${p.label} (${formatNumber(p.shares)})
        </button>
    `).join('');

    // Add click listeners
    presetsContainer.querySelectorAll('.qs-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('qsShares').value = btn.dataset.shares;
            presetsContainer.querySelectorAll('.qs-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Get entry price from trade
            const trade = trades.find(t => t.id === quickSellTradeId);
            if (trade) updateQuickSellProfit(trade.entryPrice);
        });
    });
}

function closeQuickSellModal() {
    const modal = document.getElementById('quickSellModal');
    if (modal) modal.classList.add('hidden');
    quickSellTradeId = null;
    quickSellRLevel = null;
}

function executeQuickSell() {
    if (!quickSellTradeId || !quickSellRLevel) return;

    const trade = trades.find(t => t.id === quickSellTradeId);
    if (!trade || !trade.sellPlan) return;

    const target = trade.sellPlan.targets.find(t => t.rLevel === quickSellRLevel);
    if (!target) return;

    const shares = parseInt(document.getElementById('qsShares')?.value) || 0;
    const price = parseFloat(document.getElementById('qsPrice')?.value) || 0;
    const date = document.getElementById('qsDate')?.value || new Date().toISOString().split('T')[0];

    if (!shares || !price) {
        showToast('Please enter shares and price');
        return;
    }

    // Update the sell plan target
    target.status = 'executed';
    target.sharesSold = shares;
    target.executedPrice = price;
    target.executedDate = date;

    // Add to trade's sales array
    if (!trade.sales) trade.sales = [];
    trade.sales.push({
        portion: target.portion,
        price: price,
        date: date
    });

    // Update trade status if needed
    const position = getCurrentPosition(trade);
    if (position) {
        if (position.remaining === 0) {
            trade.status = STATUS.CLOSED;
        } else if (position.sold > 0) {
            trade.status = STATUS.PARTIALLY_CLOSED;
        }
    }

    saveTrades();
    closeQuickSellModal();

    // Refresh the trade details modal if open
    if (viewingTradeId === quickSellTradeId) {
        viewTrade(quickSellTradeId);
    }

    renderTrades();
    showToast('Sale logged successfully');
}

// Escape key to close quick sell modal
document.addEventListener('keydown', (e) => {
    const quickSellModal = document.getElementById('quickSellModal');
    if (e.key === 'Escape' && quickSellModal && !quickSellModal.classList.contains('hidden')) {
        closeQuickSellModal();
    }
});

// Export functions for onclick handlers
window.openQuickSellModal = openQuickSellModal;
window.closeQuickSellModal = closeQuickSellModal;
window.executeQuickSell = executeQuickSell;

// =====================
// Close Position (Exit Remaining)
// =====================

function showClosePositionForm() {
    const form = document.getElementById('closePositionForm');
    const btn = document.getElementById('showClosePositionBtn');
    if (form && btn) {
        form.classList.remove('hidden');
        btn.classList.add('hidden');
        document.getElementById('closePositionPrice')?.focus();
    }
}

function hideClosePositionForm() {
    const form = document.getElementById('closePositionForm');
    const btn = document.getElementById('showClosePositionBtn');
    if (form && btn) {
        form.classList.add('hidden');
        btn.classList.remove('hidden');
        document.getElementById('closePositionPrice').value = '';
        const preview = document.getElementById('closePositionPreview');
        if (preview) preview.innerHTML = '';
    }
}

function updateClosePositionPreview(trade, remainingShares) {
    const preview = document.getElementById('closePositionPreview');
    const priceInput = document.getElementById('closePositionPrice');
    if (!preview || !priceInput) return;

    const exitPrice = parseFloat(priceInput.value);
    if (!exitPrice || !trade.entryPrice) {
        preview.innerHTML = '';
        return;
    }

    const pnl = (exitPrice - trade.entryPrice) * remainingShares;
    const pnlClass = pnl >= 0 ? 'profit' : 'loss';
    const pnlSign = pnl >= 0 ? '+' : '';

    preview.innerHTML = `
        <div class="close-position-pnl ${pnlClass}">
            ${pnlSign}${formatCurrency(pnl)} P/L on ${formatNumber(remainingShares)} shares
        </div>
    `;
}

function executeClosePosition(tradeId, remainingShares) {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade || !trade.sellPlan) return;

    const exitPrice = parseFloat(document.getElementById('closePositionPrice')?.value);
    const exitDate = document.getElementById('closePositionDate')?.value || new Date().toISOString().split('T')[0];

    if (!exitPrice) {
        showToast('Please enter an exit price');
        return;
    }

    // Add a "close" target to the sell plan
    const closeTarget = {
        rLevel: 'exit',
        portion: 'remaining',
        plannedShares: remainingShares,
        targetPrice: exitPrice,
        status: 'executed',
        sharesSold: remainingShares,
        executedPrice: exitPrice,
        executedDate: exitDate
    };

    trade.sellPlan.targets.push(closeTarget);

    // Add to sales array
    if (!trade.sales) trade.sales = [];
    trade.sales.push({
        portion: 'remaining',
        price: exitPrice,
        date: exitDate,
        shares: remainingShares
    });

    // Update trade status to closed
    trade.status = STATUS.CLOSED;

    saveTrades();

    // Refresh the modal
    if (viewingTradeId === tradeId) {
        viewTrade(tradeId);
    }

    renderTrades();
    showToast('Position closed');
}

function setBreakevenPrice(tradeId) {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade || !trade.sellPlan) return;

    // Calculate breakeven: need to find what price makes total P/L = 0
    // Total profit from executed sales + (remaining shares * (breakeven - entry)) = 0
    // So: breakeven = entry - (total profit from sales / remaining shares)

    const position = getCurrentPosition(trade);
    if (!position || position.remaining === 0) return;

    let totalProfit = 0;
    for (const target of trade.sellPlan.targets) {
        if (target.status === 'executed' && target.executedPrice) {
            const shares = target.sharesSold || 0;
            totalProfit += shares * (target.executedPrice - trade.entryPrice);
        }
    }

    // Breakeven price = entry - (profit already locked in / remaining shares)
    const breakevenPrice = trade.entryPrice - (totalProfit / position.remaining);

    const priceInput = document.getElementById('closePositionPrice');
    if (priceInput) {
        priceInput.value = breakevenPrice.toFixed(2);
        // Trigger preview update
        updateClosePositionPreview(trade, position.remaining);
    }
}

window.showClosePositionForm = showClosePositionForm;
window.hideClosePositionForm = hideClosePositionForm;
window.executeClosePosition = executeClosePosition;
window.setBreakevenPrice = setBreakevenPrice;

// ===== OPEN HEAT INDICATOR =====

/**
 * Calculate total account risk from non-freerolled open positions
 * A trade is freerolled once any R-level target has been executed (excluding exit targets)
 */
function calculateOpenHeat() {
    if (!accountSize || accountSize <= 0) {
        return { totalRisk: 0, percent: 0, tradeCount: 0 };
    }

    let totalRisk = 0;
    let tradeCount = 0;

    // Filter to active trades that are not archived
    const activeTrades = trades.filter(t =>
        !t.archived &&
        (t.status === 'open' || t.status === 'partially_closed')
    );

    for (const trade of activeTrades) {
        // Check if trade has been freerolled (any R-level target executed)
        let isFreerolled = false;
        if (trade.sellPlan && trade.sellPlan.enabled && trade.sellPlan.targets) {
            isFreerolled = trade.sellPlan.targets.some(target =>
                target.status === 'executed' && target.rLevel !== 'exit'
            );
        }

        // Skip freerolled trades - they have no risk
        if (isFreerolled) continue;

        // Calculate risk for this trade
        const position = trade.sellPlan && trade.sellPlan.enabled
            ? getCurrentPosition(trade)
            : null;

        const shares = position ? position.remaining : (trade.sellPlan?.initialShares || trade.snapshot?.shares || 0);
        const entryPrice = trade.entryPrice || 0;
        const currentSL = trade.currentSL || trade.initialSL || 0;

        if (shares > 0 && entryPrice > 0 && currentSL > 0 && currentSL < entryPrice) {
            const riskPerShare = entryPrice - currentSL;
            const tradeRisk = shares * riskPerShare;
            totalRisk += tradeRisk;
            tradeCount++;
        }
    }

    const percent = (totalRisk / accountSize) * 100;

    // Count total active positions (including freerolled ones)
    const activePositionCount = activeTrades.length;

    return { totalRisk, percent, tradeCount, activePositionCount };
}

/**
 * Update the Open Heat indicator display
 */
function updateOpenHeatDisplay() {
    const card = document.getElementById('openRiskCard');
    const amountEl = document.getElementById('openRiskAmount');
    const percentEl = document.getElementById('openRiskPercent');
    const levelEl = document.getElementById('openRiskLevel');

    if (!card || !amountEl || !percentEl || !levelEl) return;

    // Hide if no account size set
    if (!accountSize || accountSize <= 0) {
        card.classList.add('hidden');
        return;
    }

    card.classList.remove('hidden');

    const heat = calculateOpenHeat();

    // Update values
    amountEl.textContent = formatCurrency(heat.totalRisk);

    const displayPercent = heat.percent < 1
        ? heat.percent.toFixed(2)
        : heat.percent.toFixed(1);
    percentEl.textContent = `(${displayPercent}%)`;

    // Update tooltip with details
    card.title = heat.tradeCount > 0
        ? `${heat.tradeCount} position${heat.tradeCount > 1 ? 's' : ''} at risk`
        : 'No open positions at risk';

    // Risk level badge: CASH (no positions), LOW (<1%), MED (1-3%), HIGH (4%+)
    card.classList.remove('risk-cash', 'risk-freerolled', 'risk-low', 'risk-med', 'risk-high');

    // Only show CASH if no active positions at all
    if (heat.activePositionCount === 0) {
        levelEl.textContent = 'CASH';
        card.classList.add('risk-cash');
    } else if (heat.percent === 0) {
        // Has positions but 0% risk = all freerolled
        levelEl.textContent = 'FREEROLLED';
        card.classList.add('risk-freerolled');
    } else if (heat.percent < 1) {
        levelEl.textContent = 'LOW';
        card.classList.add('risk-low');
    } else if (heat.percent < 4) {
        levelEl.textContent = 'MED';
        card.classList.add('risk-med');
    } else {
        levelEl.textContent = 'HIGH';
        card.classList.add('risk-high');
    }
}
