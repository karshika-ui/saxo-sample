'use strict';

const state = { user: null, masters: {}, requests: [], page: 'dashboard' };
const masterConfig = {
  employee: ['Full Name', 'Select a name'],
  dealer: ['Dealer Name', 'Select a dealer'],
  direct_customer: ['Direct Customer Name', 'Select a customer'],
  unit: ['Unit Name', 'Select a unit'],
  location: ['Location', 'Select a location'],
  product: ['Product Name', 'Select a product']
};
const emailPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const validEmail = value => emailPattern.test(value) && !value.includes('..');

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({ error: 'The server returned an invalid response.' }));
  if (!response.ok) {
    if (response.status === 401 && state.user) showAuth();
    throw new Error(body.error || 'Request failed.');
  }
  return body;
}

function toast(message) {
  const element = $('#toast'); element.textContent = message; element.classList.add('show');
  window.setTimeout(() => element.classList.remove('show'), 2600);
}

function showAuth(view = 'signin') {
  state.user = null;
  $('#application').hidden = true; $('#authScreen').hidden = false;
  $('#signInPanel').hidden = view !== 'signin'; $('#signUpPanel').hidden = view !== 'signup';
  document.body.classList.remove('authenticated');
}

function showApplication(user) {
  state.user = user; $('#authScreen').hidden = true; $('#application').hidden = false;
  document.body.classList.add('authenticated'); $('#userEmail').textContent = user.email;
  $('#userDisplay').textContent = user.email.split('@')[0]; $('#avatar').textContent = user.email.charAt(0).toUpperCase();
  navigate('dashboard');
}

function clearErrors(form) { $$('.error', form).forEach(error => { error.textContent = ''; }); const general = $('.form-error', form); if (general) general.textContent = ''; }
function fieldError(input, message) { input.closest('.field').querySelector('.error').textContent = message; }

$$('[data-auth-view]').forEach(button => button.addEventListener('click', () => showAuth(button.dataset.authView)));
$('#signUpForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; clearErrors(form);
  const email = form.email.value.trim(), password = form.password.value, confirmation = form.confirmPassword.value; let valid = true;
  if (!validEmail(email)) { fieldError(form.email, 'Enter a valid email such as name@company.com.'); valid = false; }
  if (password.length < 8) { fieldError(form.password, 'Password must contain at least 8 characters.'); valid = false; }
  if (password !== confirmation) { fieldError(form.confirmPassword, 'Passwords do not match.'); valid = false; }
  if (!valid) return;
  try { await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }); form.reset(); showAuth('signin'); $('#signInEmail').value = email; toast('Account created. You can now sign in.'); }
  catch (error) { $('#signUpError').textContent = error.message; }
});

$('#signInForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; clearErrors(form); const email = form.email.value.trim(), password = form.password.value; let valid = true;
  if (!validEmail(email)) { fieldError(form.email, 'Enter a valid email address.'); valid = false; }
  if (!password) { fieldError(form.password, 'Enter your password.'); valid = false; }
  if (!valid) return;
  try { const result = await api('/api/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) }); form.reset(); showApplication(result.user); }
  catch (error) { $('#signInError').textContent = error.message; }
});

$('#logoutButton').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST' }); } finally { closeMobileMenu(); showAuth(); } });
$('#sampleMenu').addEventListener('click', event => { const group = event.currentTarget.closest('.nav-group'); group.classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', String(group.classList.contains('open'))); });
$('#collapseSidebar').addEventListener('click', () => $('#application').classList.toggle('sidebar-collapsed'));
$('#mobileMenu').addEventListener('click', () => { $('#sidebar').classList.add('mobile-open'); $('#mobileOverlay').classList.add('show'); });
$('#mobileOverlay').addEventListener('click', closeMobileMenu);
function closeMobileMenu() { $('#sidebar').classList.remove('mobile-open'); $('#mobileOverlay').classList.remove('show'); }
$$('[data-page]').forEach(button => button.addEventListener('click', () => { navigate(button.dataset.page); closeMobileMenu(); }));

async function navigate(page) {
  state.page = page; const title = { dashboard: 'Dashboard', 'request-fill': 'Sample Request Fill', 'request-view': 'Sample Request View' }[page];
  $('#pageTitle').textContent = title; $('#breadcrumb').textContent = `Workspace / ${title}`;
  $$('[data-page]').forEach(link => link.classList.toggle('active', link.dataset.page === page));
  try {
    if (page === 'dashboard') await renderDashboard();
    if (page === 'request-fill') await renderRequestForm();
    if (page === 'request-view') await renderRequestView();
  } catch (error) { $('#pageContent').innerHTML = `<div class="notice error-notice">${escapeHtml(error.message)}</div>`; }
}

async function getRequests() { const result = await api('/api/sample-requests'); state.requests = result.requests; return result.requests; }
async function renderDashboard() {
  const requests = await getRequests(), pending = requests.filter(request => request.status === 'Pending').length;
  $('#pageContent').innerHTML = `<div class="page-head"><div><p class="overline green">OVERVIEW</p><h1>Welcome back</h1><p>Track and manage your sample requests.</p></div><button class="button primary" data-go="request-fill">+ New request</button></div><section class="stats"><article><span>Total requests</span><strong>${requests.length}</strong><small>All submitted requests</small></article><article><span>Pending</span><strong>${pending}</strong><small>Awaiting progress</small></article><article><span>In progress</span><strong>${requests.filter(request => request.status === 'In Progress').length}</strong><small>Currently being processed</small></article></section><section class="panel"><div class="panel-title"><h2>Recent requests</h2><button class="text-button" data-go="request-view">View all →</button></div>${requests.length ? requestTable(requests.slice(0, 5)) : emptyState('No sample requests yet', 'Create your first request to see it here.')}</section>`;
  bindPageLinks();
}

async function loadMasters() { const result = await api('/api/masters'); state.masters = result.masters; }
function optionsFor(type, selected = '') { return (state.masters[type] || []).map(item => `<option value="${item.id}" ${String(item.id) === String(selected) ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join(''); }
function selectField(type, required = true) { const [label, placeholder] = masterConfig[type]; return `<div class="field master-field"><label for="${type}">${label} ${required ? '<b>*</b>' : ''}</label><div class="select-row"><select id="${type}" name="${type}"><option value="">${placeholder}</option>${optionsFor(type)}</select><button class="add-master" type="button" data-add-master="${type}" aria-label="Add ${label}">+ Add</button></div><small class="error"></small></div>`; }

async function renderRequestForm() {
  await loadMasters();
  $('#pageContent').innerHTML = `<div class="page-head"><div><p class="overline green">SAMPLE REQUEST</p><h1>Create a sample request</h1><p>Fields marked with an asterisk are required.</p></div></div><form id="requestForm" class="panel request-form" novalidate><h2>Requester details</h2><div class="form-grid"><div class="field"><label for="requestEmail">Email <b>*</b></label><input id="requestEmail" name="email" type="email" value="${escapeHtml(state.user.email)}" readonly><small class="error"></small></div><div class="field"><label for="ccEmail">CC Email <b>*</b></label><input id="ccEmail" name="ccEmail" type="email" placeholder="name@company.com"><small class="error"></small></div>${selectField('employee')}<fieldset class="field"><legend>Customer Type <b>*</b></legend><div class="radio-row"><label><input type="radio" name="customerType" value="dealer"> Dealer</label><label><input type="radio" name="customerType" value="direct_customer"> Direct Customer</label></div><small class="error"></small></fieldset><div id="conditionalCustomer"></div></div><h2>Sample details</h2><div class="form-grid">${selectField('unit')}${selectField('location')}${selectField('product')}<div class="field"><label for="quantity">Sample Quantity <b>*</b></label><div class="quantity-row"><input id="quantity" name="quantity" type="number" min="0.01" step="0.01" placeholder="Quantity"><select id="quantityUnit" name="quantityUnit"><option value="">Unit</option><option value="KG">KG</option><option value="g">g</option><option value="L">L</option><option value="ml">ml</option><option value="pcs">pcs</option></select></div><small class="error"></small></div></div><div class="form-actions"><button class="button secondary" type="reset">Clear</button><button class="button primary" type="submit">Submit request</button></div></form>`;
  bindMasterButtons(); const form = $('#requestForm');
  $$('[name="customerType"]', form).forEach(radio => radio.addEventListener('change', () => { $('#conditionalCustomer').innerHTML = selectField(radio.value); bindMasterButtons($('#conditionalCustomer')); }));
  form.addEventListener('reset', () => requestAnimationFrame(() => { $('#conditionalCustomer').innerHTML = ''; clearErrors(form); })); form.addEventListener('submit', submitRequest);
}

function bindMasterButtons(root = document) {
  $$('[data-add-master]', root).forEach(button => button.addEventListener('click', async () => {
    const type = button.dataset.addMaster, label = masterConfig[type][0], name = window.prompt(`Enter ${label}:`)?.trim(); if (!name) return;
    try { const result = await api('/api/masters', { method: 'POST', body: JSON.stringify({ type, name }) }); state.masters[type] ||= []; if (!state.masters[type].some(item => item.id === result.master.id)) state.masters[type].push(result.master); const select = button.parentElement.querySelector('select'); select.insertAdjacentHTML('beforeend', `<option value="${result.master.id}">${escapeHtml(result.master.name)}</option>`); select.value = String(result.master.id); toast(`${label} added.`); }
    catch (error) { button.closest('.field').querySelector('.error').textContent = error.message; }
  }));
}

function requireValue(form, name, message) { const input = form.elements[name], value = input?.value?.trim(); if (!value) { const field = input instanceof RadioNodeList ? input[0].closest('.field') : input.closest('.field'); field.querySelector('.error').textContent = message; return false; } return true; }
async function submitRequest(event) {
  event.preventDefault(); const form = event.currentTarget; clearErrors(form); let valid = true;
  if (!validEmail(form.email.value.trim())) { fieldError(form.email, 'Enter a valid email such as name@company.com.'); valid = false; }
  if (!validEmail(form.ccEmail.value.trim())) { fieldError(form.ccEmail, 'Enter one valid CC email such as name@company.com.'); valid = false; }
  [['employee', 'Select Full Name.'], ['customerType', 'Select Customer Type.'], ['unit', 'Select Unit Name.'], ['location', 'Select Location.'], ['product', 'Select Product Name.'], ['quantity', 'Enter Sample Quantity.'], ['quantityUnit', 'Select a quantity unit.']].forEach(([name, message]) => { if (!requireValue(form, name, message)) valid = false; });
  const customerType = form.elements.customerType.value; if (customerType && !requireValue(form, customerType, `Select ${masterConfig[customerType][0]}.`)) valid = false; if (!valid) return;
  const payload = { ccEmail: form.ccEmail.value.trim(), employeeId: Number(form.employee.value), customerType, customerId: Number(form.elements[customerType].value), unitId: Number(form.unit.value), locationId: Number(form.location.value), productId: Number(form.product.value), quantity: Number(form.quantity.value), quantityUnit: form.quantityUnit.value };
  try { const result = await api('/api/sample-requests', { method: 'POST', body: JSON.stringify(payload) }); toast(`Sample Request ${result.request.referenceNumber} created successfully.`); await navigate('request-view'); }
  catch (error) { const notice = document.createElement('p'); notice.className = 'form-error submit-error'; notice.textContent = error.message; form.querySelector('.form-actions').before(notice); }
}

async function renderRequestView() { const requests = await getRequests(); $('#pageContent').innerHTML = `<div class="page-head"><div><p class="overline green">SAMPLE REQUEST</p><h1>Sample Request View</h1><p>View all requests submitted from your account.</p></div><button class="button primary" data-go="request-fill">+ New request</button></div><section class="panel"><div class="table-tools"><input id="requestSearch" type="search" placeholder="Search by reference or product"><span>${requests.length} record${requests.length === 1 ? '' : 's'}</span></div>${requests.length ? requestTable(requests) : emptyState('No requests found', 'Submitted sample requests will appear here.')}</section>`; bindPageLinks(); $('#requestSearch')?.addEventListener('input', event => { const term = event.target.value.toLowerCase(); $$('tbody tr').forEach(row => { row.hidden = !row.textContent.toLowerCase().includes(term); }); }); }
function requestTable(requests) { return `<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Created</th><th>Email / CC</th><th>Full Name</th><th>Customer</th><th>Unit / Location</th><th>Product</th><th>Quantity</th><th>Status</th></tr></thead><tbody>${requests.map(request => `<tr><td><strong>${escapeHtml(request.referenceNumber)}</strong></td><td>${escapeHtml(new Date(request.createdAt).toLocaleString())}</td><td>${escapeHtml(request.email)}<small>CC: ${escapeHtml(request.ccEmail)}</small></td><td>${escapeHtml(request.employeeName)}</td><td>${escapeHtml(request.customerType === 'dealer' ? 'Dealer' : 'Direct Customer')}<small>${escapeHtml(request.customerName)}</small></td><td>${escapeHtml(request.unitName)}<small>${escapeHtml(request.locationName)}</small></td><td>${escapeHtml(request.productName)}</td><td>${escapeHtml(request.quantity)} ${escapeHtml(request.quantityUnit)}</td><td><span class="status">${escapeHtml(request.status)}</span></td></tr>`).join('')}</tbody></table></div>`; }
function emptyState(title, text) { return `<div class="empty-state"><div>▱</div><h3>${title}</h3><p>${text}</p></div>`; }
function bindPageLinks() { $$('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go))); }

(async function initialize() { try { const result = await api('/api/auth/session'); if (result.user) showApplication(result.user); else showAuth(); } catch { showAuth(); } })();
