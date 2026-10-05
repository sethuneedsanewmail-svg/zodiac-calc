const state = {
  history: [],
  currentPage: 'pending',
  currentPageNumber: 1,
  pageSize: 25
};

const $ = selector => document.querySelector(selector);
const money = value => '₦' + Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
const pdfMoney = value => 'NGN ' + Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });

async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({ error: 'Invalid server response' }));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function attr(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function getStatus(row) {
  return (row[4] || 'Pending').trim();
}

function updateCounts() {
  const counts = { Pending: 0, Confirmed: 0, Cancelled: 0 };
  state.history.forEach(row => {
    const status = getStatus(row);
    if (counts[status] !== undefined) counts[status]++;
  });
  if ($('#pendingCount')) $('#pendingCount').textContent = counts.Pending;
  if ($('#confirmedCount')) $('#confirmedCount').textContent = counts.Confirmed;
  if ($('#cancelledCount')) $('#cancelledCount').textContent = counts.Cancelled;
}

function filteredRows() {
  const search = ($('#historySearch')?.value || '').trim().toLowerCase();
  const status = state.currentPage.charAt(0).toUpperCase() + state.currentPage.slice(1);
  return state.history
    .map(row => ({ no: row[0], client: row[1], date: row[2], total: Number(row[3] || 0), status: getStatus(row) }))
    .filter(item => {
      const statusMatch = item.status === status;
      const searchMatch = !search || `${item.no} ${item.client} ${item.date}`.toLowerCase().includes(search);
      return statusMatch && searchMatch;
    });
}

function render() {
  const container = $('#history');
  if (!container) return;
  const rows = filteredRows();
  const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.currentPageNumber = Math.min(state.currentPageNumber, totalPages);
  const start = (state.currentPageNumber - 1) * state.pageSize;
  const visible = rows.slice(start, start + state.pageSize);

  if ($('#activeOrdersTitle')) {
    $('#activeOrdersTitle').textContent = `${state.currentPage.charAt(0).toUpperCase() + state.currentPage.slice(1)} Orders`;
  }

  if (!visible.length) {
    const label = state.currentPage.charAt(0).toUpperCase() + state.currentPage.slice(1);
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><h3>No ${esc(label)} Orders</h3><p>There are currently no ${esc(state.currentPage)} orders.</p></div>`;
  } else {
    container.innerHTML = visible.map(item => {
      let actions = `<button class="ghost" onclick="pdf('${attr(item.no)}')">View / PDF</button><button class="danger" onclick="delVoucher('${attr(item.no)}')">Delete</button>`;
      if (item.status === 'Pending') {
        actions = `<button class="ghost" onclick="pdf('${attr(item.no)}')">View / PDF</button><button class="secondary" onclick="confirmVoucher('${attr(item.no)}')">Confirm</button><button class="cancel-button" onclick="cancelVoucher('${attr(item.no)}')">Cancel</button><button class="danger" onclick="delVoucher('${attr(item.no)}')">Delete</button>`;
      }
      return `<div class="history-row"><div class="history-main"><div class="order-heading"><strong>${esc(item.no)}</strong><span class="status-badge status-${item.status.toLowerCase()}">${esc(item.status)}</span></div><strong>${esc(item.client)}</strong><small>${esc(item.date)}</small></div><div class="history-right"><strong class="order-total">${money(item.total)}</strong><div class="history-actions">${actions}</div></div></div>`;
    }).join('');
  }

  const pagination = $('#historyPagination');
  if (pagination) {
    pagination.innerHTML = `<button type="button" id="prevPage" ${state.currentPageNumber <= 1 ? 'disabled' : ''}>← Previous</button><span class="history-page-info">Page ${state.currentPageNumber} of ${totalPages}</span><button type="button" id="nextPage" ${state.currentPageNumber >= totalPages ? 'disabled' : ''}>Next →</button>`;
    $('#prevPage').onclick = () => { if (state.currentPageNumber > 1) { state.currentPageNumber--; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
    $('#nextPage').onclick = () => { if (state.currentPageNumber < totalPages) { state.currentPageNumber++; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
  }
}

async function loadHistory() {
  const result = await api('/history');
  state.history = result.rows || [];
  updateCounts();
  render();
}

function switchPage(page) {
  state.currentPage = page;
  state.currentPageNumber = 1;
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  render();
}

async function confirmVoucher(voucherNo) {
  if (!confirm('Confirm voucher ' + voucherNo + '?')) return;
  try {
    await api('/vouchers', { method: 'POST', body: JSON.stringify({ action: 'confirm', voucherNo }) });
    await loadHistory();
    switchPage('confirmed');
  } catch (error) { alert(error.message); }
}

async function cancelVoucher(voucherNo) {
  if (!confirm('Cancel voucher ' + voucherNo + '?\n\nIt will move to Cancelled Orders.')) return;
  try {
    await api('/vouchers', { method: 'POST', body: JSON.stringify({ action: 'cancel', voucherNo }) });
    await loadHistory();
    switchPage('cancelled');
  } catch (error) { alert(error.message); }
}

async function delVoucher(voucherNo) {
  if (!confirm('Delete ' + voucherNo + ' permanently?')) return;
  try {
    await api('/vouchers', { method: 'POST', body: JSON.stringify({ action: 'delete', voucherNo }) });
    await loadHistory();
  } catch (error) { alert(error.message); }
}

async function pdf(no) {
  // Open the tab immediately from the click event so mobile browsers do not block it.
  const pdfWindow = window.open('', '_blank');
  if (!pdfWindow) {
    alert('Please allow pop-ups for this site to view the PDF.');
    return;
  }
  pdfWindow.document.write('<!doctype html><html><head><title>Voucher PDF</title></head><body style="font-family:Arial;padding:24px">Preparing voucher PDF…</body></html>');
  pdfWindow.document.close();

  try {
    const result = await api('/vouchers?mode=get&voucherNo=' + encodeURIComponent(no));
    const voucher = result.voucher;
    if (!window.jspdf) throw new Error('PDF library is not loaded.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const usableWidth = pageWidth - margin * 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('VOUCHER', margin, 18);
    doc.setFontSize(10);
    doc.text(voucher.voucherNo, pageWidth - margin, 18, { align: 'right' });
    doc.setLineWidth(0.4);
    doc.line(margin, 22, pageWidth - margin, 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Client:', margin, 30);
    doc.setFont('helvetica', 'bold');
    doc.text(String(voucher.clientName || ''), margin + 18, 30);
    doc.setFont('helvetica', 'normal');
    doc.text('Date:', margin, 36);
    doc.setFont('helvetica', 'bold');
    doc.text(String(voucher.date || ''), margin + 18, 36);

    const rows = (voucher.items || []).map((item, index) => [index + 1, String(item.description || ''), item.quantity, pdfMoney(item.unitPrice), pdfMoney(item.lineTotal)]);
    doc.autoTable({
      startY: 44,
      margin: { left: margin, right: margin },
      tableWidth: usableWidth,
      head: [['#', 'Product', 'Qty', 'Unit Price', 'Amount']],
      body: rows,
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 84, halign: 'left' },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 32, halign: 'right' }
      }
    });

    const finalY = doc.lastAutoTable?.finalY || 50;
    let totalY = finalY + 12;
    if (totalY > pageHeight - 25) { doc.addPage(); totalY = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TOTAL', pageWidth - margin - 48, totalY);
    doc.setFontSize(13);
    doc.text(pdfMoney(voucher.total), pageWidth - margin, totalY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Paper Core • Order & Voucher Management', margin, pageHeight - 8);

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    pdfWindow.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    console.error('PDF error:', error);
    pdfWindow.document.body.innerHTML = `<h3>Could not create PDF</h3><p>${esc(error.message)}</p>`;
  }
}

window.pdf = pdf;
window.confirmVoucher = confirmVoucher;
window.cancelVoucher = cancelVoucher;
window.delVoucher = delVoucher;
window.switchPage = switchPage;

document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => switchPage(button.dataset.page)));
  const search = $('#historySearch');
  if (search) search.oninput = () => { state.currentPageNumber = 1; render(); };
  const status = $('#statusFilter');
  if (status) status.onchange = () => { state.currentPage = status.value.toLowerCase(); state.currentPageNumber = 1; switchPage(state.currentPage); };
  const refresh = $('#historyRefresh');
  if (refresh) refresh.onclick = loadHistory;

  try {
    await loadHistory();
    switchPage('pending');
  } catch (error) {
    console.error('History error:', error);
    const container = $('#history');
    if (container) container.innerHTML = `<div class="empty-state"><h3>Could not load order history</h3><p>${esc(error.message)}</p></div>`;
  }
});
