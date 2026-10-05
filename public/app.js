const state = { products: [] };
const $ = selector => document.querySelector(selector);
const money = value => '₦' + Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({ error: 'Invalid server response' }));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function setStatus(text, error = false) {
  const element = $('#status');
  if (!element) return;
  element.textContent = text || '';
  element.style.color = error ? '#b91c1c' : '#4b5563';
}

function updateTotal() {
  let total = 0;
  document.querySelectorAll('.item-card').forEach(card => {
    const quantity = Number(card.querySelector('.qty')?.value) || 0;
    const price = Number(card.querySelector('.price')?.value) || 0;
    total += quantity * price;
  });
  const totalElement = $('#grandTotal');
  if (totalElement) totalElement.textContent = money(total);
  return total;
}

function addItem() {
  const template = $('#itemTemplate');
  if (!template) throw new Error('Product template not found.');

  const fragment = document.importNode(template.content, true);
  const card = fragment.querySelector('.item-card');
  const product = fragment.querySelector('.product');
  const price = fragment.querySelector('.price');
  const qty = fragment.querySelector('.qty');
  const line = fragment.querySelector('.line');
  if (!card || !product || !price || !qty || !line) throw new Error('Product form elements are missing.');

  state.products.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.description;
    product.appendChild(option);
  });

  function recalc() {
    const selected = state.products.find(p => String(p.id) === String(product.value));
    if (selected) {
      if (price.value === '' || price.dataset.auto === '1') {
        price.value = Number(selected.price) || 0;
        price.dataset.auto = '1';
      }
      const title = card.querySelector('.item-title');
      if (title) title.textContent = selected.description;
    } else {
      const title = card.querySelector('.item-title');
      if (title) title.textContent = 'Select Product';
    }

    const quantity = Number(qty.value) || 0;
    const unitPrice = Number(price.value) || 0;
    line.value = money(quantity * unitPrice);
    updateTotal();
  }

  product.onchange = () => {
    const selected = state.products.find(p => String(p.id) === String(product.value));
    if (selected) {
      price.value = Number(selected.price) || 0;
      price.dataset.auto = '1';
    } else {
      price.value = '';
      price.dataset.auto = '0';
    }
    recalc();
  };

  qty.oninput = recalc;
  price.oninput = () => { price.dataset.auto = '0'; recalc(); };

  const remove = fragment.querySelector('.remove');
  if (remove) remove.onclick = () => { card.remove(); updateTotal(); };

  $('#items').appendChild(fragment);
  // Deliberately do not select the first product. The new row stays blank.
  recalc();
}

function collect() {
  const items = [];
  document.querySelectorAll('.item-card').forEach(card => {
    const productId = card.querySelector('.product')?.value;
    const product = state.products.find(p => String(p.id) === String(productId));
    const quantity = Number(card.querySelector('.qty')?.value) || 0;
    const unitPrice = Number(card.querySelector('.price')?.value) || 0;
    if (product && quantity > 0) {
      items.push({ productId: product.id, description: product.description, quantity, unitPrice, lineTotal: quantity * unitPrice });
    }
  });
  return {
    clientName: $('#clientName')?.value.trim() || '',
    date: $('#voucherDate')?.value || '',
    items
  };
}

async function next() {
  try {
    const date = $('#voucherDate')?.value || today();
    const result = await api('/vouchers?mode=next&date=' + encodeURIComponent(date));
    const element = $('#voucherNo');
    if (element) element.textContent = result.voucherNo;
  } catch {
    const element = $('#voucherNo');
    if (element) element.textContent = '—';
  }
}

async function save() {
  const voucher = collect();
  if (!voucher.clientName) return setStatus('Enter a client name.', true);
  if (!voucher.date) return setStatus('Select a date.', true);
  if (!voucher.items.length) return setStatus('Select at least one product.', true);

  try {
    const button = $('#saveBtn');
    if (button) button.disabled = true;
    setStatus('Saving…');
    const result = await api('/vouchers', { method: 'POST', body: JSON.stringify(voucher) });
    setStatus('Saved ' + result.voucherNo);
    await next();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    const button = $('#saveBtn');
    if (button) button.disabled = false;
  }
}

async function resetToday() {
  if (!confirm("Reset today\'s voucher numbering?\n\nThis only works when there are no vouchers today.")) return;
  try {
    await api('/vouchers', { method: 'POST', body: JSON.stringify({ action: 'reset', date: today() }) });
    await next();
    alert("Today's numbering reset.");
  } catch (error) {
    alert(error.message);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const date = $('#voucherDate');
    if (date) date.value = today();

    const add = $('#addItem');
    if (add) add.onclick = addItem;

    const saveButton = $('#saveBtn');
    if (saveButton) saveButton.onclick = save;

    const clear = $('#clearBtn');
    if (clear) clear.onclick = () => location.reload();

    const reset = $('#resetToday');
    if (reset) reset.onclick = resetToday;

    if (date) date.onchange = next;

    setStatus('Loading products…');
    const result = await api('/products');
    state.products = result.products || [];
    if (!state.products.length) throw new Error('No products were returned from Google Sheets.');

    // One blank product row is shown initially, but no product is selected.
    addItem();
    await next();
    setStatus('');
  } catch (error) {
    console.error('Voucher Manager error:', error);
    setStatus(error.message, true);
    alert('Voucher Manager error:\n\n' + error.message);
  }
});
