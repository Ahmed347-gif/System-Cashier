// Configuration
const HOURLY_RATE = 40; // EGP per hour - change as needed
const TAX_RATE = 2; // VAT percentage
const STORAGE_KEY = "ws_clients_v1";
const INVOICE_NUMBER_KEY = "ws_invoice_number";
const PRODUCTS_KEY = "cashier_products_v1";
const SALES_KEY = "cashier_sales_v1";
const CART_KEY = "cashier_cart_v1";

// State
let clients = []; // { id, name, phone, checkInTs }
let products = []; // { id, name, price, category, description }
let cart = []; // { productId, quantity }
let sales = []; // { id, invoiceNumber, date, items, subtotal, discount, tax, total, paymentMethod, customer }
let durationTimer = null;
let editingProductId = null;

// Elements
const form = document.getElementById("checkInForm");
const nameInput = document.getElementById("nameInput");
const phoneInput = document.getElementById("phoneInput");
const checkInInput = document.getElementById("checkInInput");
const hourlyRateLabel = document.getElementById("hourlyRateLabel");
const tbody = document.getElementById("clientsTbody");
const emptyState = document.getElementById("emptyState");

// Invoice modal elements
const invoiceModal = document.getElementById("invoiceModal");
const invoiceCloseBtn = document.getElementById("invoiceCloseBtn");
const doneInvoiceBtn = document.getElementById("doneInvoiceBtn");
const printInvoiceBtn = document.getElementById("printInvoiceBtn");

// Utils
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString("ar-EG", {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("ar-EG", {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function getNextInvoiceNumber() {
  try {
    const num = parseInt(localStorage.getItem(INVOICE_NUMBER_KEY) || "0", 10);
    const next = num + 1;
    localStorage.setItem(INVOICE_NUMBER_KEY, String(next));
    return String(next).padStart(6, '0');
  } catch (e) {
    return String(Date.now()).slice(-6);
  }
}

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} ساعة ${minutes} دقيقة`;
}

function calculateTotal(ms) {
  const hours = ms / (1000 * 60 * 60);
  const total = Math.ceil(hours * 100) / 100 * HOURLY_RATE; // round to 2dp for hours then multiply
  return Math.max(0, total);
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
  } catch (e) {
    console.error("Failed to save to localStorage", e);
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    clients = raw ? JSON.parse(raw) : [];
  } catch (e) {
    clients = [];
  }
}

function setDefaultCheckIn() {
  const nowLocal = new Date();
  const tzOffset = nowLocal.getTimezoneOffset();
  const localISOTime = new Date(nowLocal.getTime() - tzOffset * 60000).toISOString().slice(0, 16);
  checkInInput.value = localISOTime;
}

function render() {
  hourlyRateLabel.textContent = `${HOURLY_RATE} جنيه/ساعة`;
  tbody.innerHTML = "";
  if (!clients.length) {
    emptyState.style.display = "block";
    stopDurationTimer();
    return;
  }
  emptyState.style.display = "none";

  clients.forEach((c, idx) => {
    const tr = document.createElement("tr");
    const now = Date.now();
    const durationMs = now - c.checkInTs;

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(c.name)}</td>
      <td dir="ltr">${escapeHtml(c.phone)}</td>
      <td>${formatTime(c.checkInTs)}</td>
      <td data-duration>${formatDuration(durationMs)}</td>
      <td>
        <button class="btn danger" data-checkout="${c.id}">🚪 تسجيل خروج</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  // Update durations after rendering
  updateDurations();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function startDurationTimer() {
  stopDurationTimer();
  // Update immediately
  updateDurations();
  // Then update every 10 seconds for better performance
  durationTimer = setInterval(updateDurations, 10 * 1000);
}

function updateDurations() {
  const rows = tbody.querySelectorAll("tr");
  const now = Date.now();
  rows.forEach((row, i) => {
    const cell = row.querySelector('[data-duration]');
    const c = clients[i];
    if (!c || !cell) return;
    cell.textContent = formatDuration(now - c.checkInTs);
  });
}

function stopDurationTimer() {
  if (durationTimer) {
    clearInterval(durationTimer);
    durationTimer = null;
  }
}

function addClient(evt) {
  evt.preventDefault();
  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  const checkInLocal = checkInInput.value; // yyyy-MM-ddTHH:mm
  if (!name || !phone || !checkInLocal) return;

  const checkInTs = new Date(checkInLocal).getTime();
  const client = { id: cryptoRandomId(), name, phone, checkInTs };
  clients.push(client);
  save();
  render();
  startDurationTimer();
  form.reset();
  setDefaultCheckIn();
  nameInput.focus();
}

function cryptoRandomId() {
  if (window.crypto && crypto.getRandomValues) {
    const arr = new Uint32Array(2);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(n => n.toString(16)).join("");
  }
  return String(Date.now()) + Math.random().toString(16).slice(2);
}

function onCheckout(id) {
  const idx = clients.findIndex(c => c.id === id);
  if (idx === -1) return;
  const client = clients[idx];
  const endTs = Date.now();
  const duration = endTs - client.checkInTs;
  const total = calculateTotal(duration);
  const invoiceNum = getNextInvoiceNumber();

  // Create sale object for workspace checkout
  const sale = {
    id: cryptoRandomId(),
    invoiceNumber: invoiceNum,
    date: endTs,
    items: [{
      name: `استخدام Workspace - ${formatDuration(duration)}`,
      quantity: 1,
      price: total,
      total: total
    }],
    subtotal: total,
    discount: 0,
    tax: 0,
    total: total,
    paymentMethod: 'cash',
    customer: client.name,
    phone: client.phone,
    checkInTime: client.checkInTs,
    checkOutTime: endTs,
    duration: duration
  };

  // Save to sales
  sales.unshift(sale);
  saveSales();

  // Show invoice
  showInvoice(sale);

  // Remove from list and persist
  clients.splice(idx, 1);
  save();
  render();
  renderSales();
  updateStats();
}

function openModal() {
  invoiceModal.classList.remove("hidden");
  invoiceModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  invoiceModal.classList.add("hidden");
  invoiceModal.setAttribute("aria-hidden", "true");
}

function openInvoiceModal() {
  invoiceModal.classList.remove("hidden");
  invoiceModal.setAttribute("aria-hidden", "false");
}

function onTableClick(e) {
  const btn = e.target.closest("[data-checkout]");
  if (!btn) return;
  const id = btn.getAttribute("data-checkout");
  onCheckout(id);
}

function setupEvents() {
  form.addEventListener("submit", addClient);
  document.getElementById("clientsTable").addEventListener("click", onTableClick);
  invoiceCloseBtn.addEventListener("click", closeModal);
  doneInvoiceBtn.addEventListener("click", closeModal);
  printInvoiceBtn.addEventListener("click", () => window.print());
  invoiceModal.addEventListener("click", (e) => {
    if (e.target && e.target.getAttribute("data-close") === "true") closeModal();
  });
}

function init() {
  hourlyRateLabel.textContent = `${HOURLY_RATE} جنيه/ساعة`;
  setDefaultCheckIn();
  load();
  render();
  setupEvents();
  if (clients.length) startDurationTimer();
}

// ========== CASHIER SYSTEM ==========

// Elements
const productsGrid = document.getElementById("productsGrid");
const noProducts = document.getElementById("noProducts");
const productSearch = document.getElementById("productSearch");
const cartItems = document.getElementById("cartItems");
const emptyCart = document.getElementById("emptyCart");
const cartSubtotal = document.getElementById("cartSubtotal");
const cartDiscount = document.getElementById("cartDiscount");
const cartTax = document.getElementById("cartTax");
const cartTotal = document.getElementById("cartTotal");
const discountInput = document.getElementById("discountInput");
const applyDiscountBtn = document.getElementById("applyDiscountBtn");
const clearCartBtn = document.getElementById("clearCartBtn");
const checkoutBtn = document.getElementById("checkoutBtn");
const customerName = document.getElementById("customerName");
const customerPhone = document.getElementById("customerPhone");
const salesTbody = document.getElementById("salesTbody");
const emptySales = document.getElementById("emptySales");
const todaySales = document.getElementById("todaySales");
const todayTotal = document.getElementById("todayTotal");

// Product Management
const productModal = document.getElementById("productModal");
const productForm = document.getElementById("productForm");
const productModalTitle = document.getElementById("productModalTitle");
const manageProductsBtn = document.getElementById("manageProductsBtn");
const closeProductModal = document.getElementById("closeProductModal");
const cancelProductBtn = document.getElementById("cancelProductBtn");

// Reports
const reportsModal = document.getElementById("reportsModal");
const viewReportsBtn = document.getElementById("viewReportsBtn");
const closeReportsModal = document.getElementById("closeReportsModal");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

let currentDiscount = 0;

// Initialize default products
const defaultProducts = [
  { id: "1", name: "ساعة Workspace", price: 40, category: "workspace", description: "استخدام مساحة العمل" },
  { id: "2", name: "قهوة إسبريسو", price: 25, category: "drinks", description: "" },
  { id: "3", name: "كابتشينو", price: 30, category: "drinks", description: "" },
  { id: "4", name: "شاي", price: 15, category: "drinks", description: "" },
  { id: "5", name: "ساندويتش", price: 45, category: "food", description: "" },
  { id: "6", name: "كرواسون", price: 20, category: "snacks", description: "" }
];

// Load/Save Products
function loadProducts() {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    products = raw ? JSON.parse(raw) : defaultProducts;
    if (!raw) saveProducts();
  } catch (e) {
    products = defaultProducts;
    saveProducts();
  }
}

function saveProducts() {
  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  } catch (e) {
    console.error("Failed to save products", e);
  }
}

// Load/Save Cart
function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    cart = raw ? JSON.parse(raw) : [];
  } catch (e) {
    cart = [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch (e) {
    console.error("Failed to save cart", e);
  }
}

// Load/Save Sales
function loadSales() {
  try {
    const raw = localStorage.getItem(SALES_KEY);
    sales = raw ? JSON.parse(raw) : [];
  } catch (e) {
    sales = [];
  }
}

function saveSales() {
  try {
    localStorage.setItem(SALES_KEY, JSON.stringify(sales));
  } catch (e) {
    console.error("Failed to save sales", e);
  }
}

// Render Products
function renderProducts(filter = "") {
  productsGrid.innerHTML = "";
  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    p.category.toLowerCase().includes(filter.toLowerCase())
  );
  
  if (filtered.length === 0) {
    noProducts.style.display = "block";
    return;
  }
  noProducts.style.display = "none";
  
  filtered.forEach(product => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <div class="product-info">
        <h3>${escapeHtml(product.name)}</h3>
        <p class="product-price">${product.price.toFixed(2)} جنيه</p>
        ${product.description ? `<p class="product-desc">${escapeHtml(product.description)}</p>` : ''}
      </div>
      <button class="btn primary" data-add-product="${product.id}">➕ إضافة</button>
    `;
    productsGrid.appendChild(card);
  });
}

// Render Cart
function renderCart() {
  cartItems.innerHTML = "";
  if (cart.length === 0) {
    emptyCart.style.display = "block";
    checkoutBtn.disabled = true;
    updateCartSummary();
    return;
  }
  emptyCart.style.display = "none";
  checkoutBtn.disabled = false;
  
  cart.forEach((item, idx) => {
    const product = products.find(p => p.id === item.productId);
    if (!product) return;
    
    const tr = document.createElement("tr");
    const total = product.price * item.quantity;
    tr.innerHTML = `
      <td>${escapeHtml(product.name)}</td>
      <td>
        <div class="quantity-controls">
          <button class="btn-icon small" data-decrease="${idx}">−</button>
          <span>${item.quantity}</span>
          <button class="btn-icon small" data-increase="${idx}">+</button>
        </div>
      </td>
      <td>${product.price.toFixed(2)}</td>
      <td>${total.toFixed(2)}</td>
      <td><button class="btn-icon danger" data-remove="${idx}">🗑️</button></td>
    `;
    cartItems.appendChild(tr);
  });
  
  updateCartSummary();
}

// Update Cart Summary
function updateCartSummary() {
  let subtotal = 0;
  cart.forEach(item => {
    const product = products.find(p => p.id === item.productId);
    if (product) subtotal += product.price * item.quantity;
  });
  
  const discountAmount = (subtotal * currentDiscount) / 100;
  const afterDiscount = subtotal - discountAmount;
  const tax = (afterDiscount * TAX_RATE) / 100;
  const total = afterDiscount + tax;
  
  cartSubtotal.textContent = `${subtotal.toFixed(2)} جنيه`;
  cartDiscount.textContent = `${discountAmount.toFixed(2)} جنيه`;
  cartTax.textContent = `${tax.toFixed(2)} جنيه`;
  cartTotal.textContent = `${total.toFixed(2)} جنيه`;
  
  saveCart();
}

// Add to Cart
function addToCart(productId) {
  const existing = cart.find(item => item.productId === productId);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ productId, quantity: 1 });
  }
  renderCart();
}

// Remove from Cart
function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
}

// Update Quantity
function updateQuantity(index, delta) {
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) {
    removeFromCart(index);
  } else {
    renderCart();
  }
}

// Apply Discount
function applyDiscount() {
  const value = parseFloat(discountInput.value);
  if (isNaN(value) || value < 0 || value > 100) {
    alert("الرجاء إدخال نسبة خصم صحيحة (0-100)");
    return;
  }
  currentDiscount = value;
  updateCartSummary();
  discountInput.value = "";
}

// Checkout
function checkout() {
  if (cart.length === 0) return;
  
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
  const customer = customerName.value.trim() || "عميل";
  const phone = customerPhone.value.trim() || "";
  
  const invoiceNumber = getNextInvoiceNumber();
  const invoiceItems = cart.map(item => {
    const product = products.find(p => p.id === item.productId);
    return {
      name: product.name,
      quantity: item.quantity,
      price: product.price,
      total: product.price * item.quantity
    };
  });
  
  let subtotal = 0;
  invoiceItems.forEach(item => subtotal += item.total);
  const discountAmount = (subtotal * currentDiscount) / 100;
  const afterDiscount = subtotal - discountAmount;
  const tax = (afterDiscount * TAX_RATE) / 100;
  const total = afterDiscount + tax;
  
  const sale = {
    id: cryptoRandomId(),
    invoiceNumber,
    date: Date.now(),
    items: invoiceItems,
    subtotal,
    discount: discountAmount,
    tax,
    total,
    paymentMethod,
    customer,
    phone
  };
  
  sales.unshift(sale);
  saveSales();
  
  // Show invoice
  showInvoice(sale);
  
  // Clear cart
  cart = [];
  currentDiscount = 0;
  customerName.value = "";
  customerPhone.value = "";
  discountInput.value = "";
  renderCart();
  renderSales();
  updateStats();
}

// Show Invoice
function showInvoice(sale) {
  const invItems = document.getElementById("invItems");
  invItems.innerHTML = "";
  
  sale.items.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td>${item.quantity}</td>
      <td>${item.price.toFixed(2)}</td>
      <td>${item.total.toFixed(2)}</td>
    `;
    invItems.appendChild(tr);
  });
  
  document.getElementById("invNumber").textContent = `#${sale.invoiceNumber}`;
  
  // Format date more compactly
  const dateStr = new Date(sale.date).toLocaleDateString("ar-EG", {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  document.getElementById("invDate").textContent = dateStr;
  
  const customerRow = document.getElementById("invCustomerRow");
  const invCustomer = document.getElementById("invCustomer");
  if (sale.customer && sale.customer !== "عميل") {
    let customerText = sale.customer;
    if (sale.phone) customerText += ` - ${sale.phone}`;
    invCustomer.textContent = customerText;
    customerRow.style.display = "flex";
  } else {
    customerRow.style.display = "none";
  }
  
  // Show workspace details if available
  if (sale.checkInTime && sale.checkOutTime) {
    let workspaceRow = document.getElementById("invWorkspaceRow");
    if (!workspaceRow) {
      const infoCompact = document.querySelector(".invoice-info-compact");
      workspaceRow = document.createElement("div");
      workspaceRow.className = "info-row";
      workspaceRow.id = "invWorkspaceRow";
      infoCompact.appendChild(workspaceRow);
    }
    workspaceRow.innerHTML = `
      <span>المدة:</span>
      <span>${formatDuration(sale.duration)}</span>
    `;
    workspaceRow.style.display = "flex";
  } else {
    const workspaceRow = document.getElementById("invWorkspaceRow");
    if (workspaceRow) workspaceRow.style.display = "none";
  }
  
  document.getElementById("invSubtotal").textContent = `${sale.subtotal.toFixed(2)} جنيه`;
  
  const discountRow = document.getElementById("invDiscountRow");
  if (sale.discount > 0) {
    document.getElementById("invDiscount").textContent = `${sale.discount.toFixed(2)} جنيه`;
    discountRow.style.display = "flex";
  } else {
    discountRow.style.display = "none";
  }
  
  const taxRow = document.getElementById("invTaxRow");
  if (sale.tax > 0) {
    document.getElementById("invTax").textContent = `${sale.tax.toFixed(2)} جنيه`;
    if (taxRow) taxRow.style.display = "flex";
  } else {
    if (taxRow) taxRow.style.display = "none";
  }
  
  document.getElementById("invTotalAmount").textContent = `${sale.total.toFixed(2)} جنيه`;
  
  openInvoiceModal();
}

// Render Sales
function renderSales() {
  salesTbody.innerHTML = "";
  if (sales.length === 0) {
    emptySales.style.display = "block";
    return;
  }
  emptySales.style.display = "none";
  
  sales.slice(0, 50).forEach(sale => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${sale.invoiceNumber}</td>
      <td>${formatDate(sale.date)}</td>
      <td>${escapeHtml(sale.customer)}</td>
      <td>${sale.total.toFixed(2)} جنيه</td>
      <td>${getPaymentMethodName(sale.paymentMethod)}</td>
      <td>
        <button class="btn-icon" data-view-invoice="${sale.id}" title="عرض الفاتورة">👁️</button>
      </td>
    `;
    salesTbody.appendChild(tr);
  });
}

function getPaymentMethodName(method) {
  const methods = {
    cash: "💵 نقدي",
    card: "💳 كارت",
    mobile: "📱 محفظة"
  };
  return methods[method] || method;
}

// Update Stats
function updateStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todaySalesList = sales.filter(s => {
    const saleDate = new Date(s.date);
    saleDate.setHours(0, 0, 0, 0);
    return saleDate.getTime() === today.getTime();
  });
  
  const salesCount = todaySalesList.length;
  const totalAmount = todaySalesList.reduce((sum, s) => sum + s.total, 0);
  
  todaySales.textContent = salesCount;
  todayTotal.textContent = `${totalAmount.toFixed(2)} جنيه`;
}

// Product Management
function openProductModal(productId = null) {
  productModal.classList.remove("hidden");
  renderProductsList();
  if (productId) {
    showProductForm(productId);
  } else {
    document.getElementById("productFormWrapper").classList.add("hidden");
  }
}

function closeProductModalFunc() {
  productModal.classList.add("hidden");
  editingProductId = null;
  productForm.reset();
  document.getElementById("productFormWrapper").classList.add("hidden");
}

function renderProductsList() {
  const productsList = document.getElementById("productsList");
  productsList.innerHTML = "";
  
  if (products.length === 0) {
    productsList.innerHTML = "<p class='empty'>لا توجد منتجات</p>";
    return;
  }
  
  products.forEach(product => {
    const div = document.createElement("div");
    div.className = "product-list-item";
    div.innerHTML = `
      <div class="product-list-info">
        <h4>${escapeHtml(product.name)}</h4>
        <p>${product.price.toFixed(2)} جنيه - ${getCategoryName(product.category)}</p>
      </div>
      <div class="product-list-actions">
        <button class="btn-icon" data-edit-product="${product.id}" title="تعديل">✏️</button>
        <button class="btn-icon danger" data-delete-product="${product.id}" title="حذف">🗑️</button>
      </div>
    `;
    productsList.appendChild(div);
  });
}

function getCategoryName(category) {
  const names = {
    workspace: "Workspace",
    drinks: "مشروبات",
    food: "أطعمة",
    snacks: "سناكس",
    other: "أخرى"
  };
  return names[category] || category;
}

function showProductForm(productId = null) {
  editingProductId = productId;
  const formWrapper = document.getElementById("productFormWrapper");
  formWrapper.classList.remove("hidden");
  
  if (productId) {
    const product = products.find(p => p.id === productId);
    productModalTitle.textContent = "تعديل منتج";
    document.getElementById("productName").value = product.name;
    document.getElementById("productPrice").value = product.price;
    document.getElementById("productCategory").value = product.category;
    document.getElementById("productDescription").value = product.description || "";
  } else {
    productModalTitle.textContent = "إضافة منتج جديد";
    productForm.reset();
  }
}

function deleteProduct(productId) {
  if (confirm("هل أنت متأكد من حذف هذا المنتج؟")) {
    products = products.filter(p => p.id !== productId);
    saveProducts();
    renderProducts(productSearch.value);
    renderProductsList();
  }
}

function saveProduct(e) {
  e.preventDefault();
  const name = document.getElementById("productName").value.trim();
  const price = parseFloat(document.getElementById("productPrice").value);
  const category = document.getElementById("productCategory").value;
  const description = document.getElementById("productDescription").value.trim();
  
  if (!name || isNaN(price) || price < 0) {
    alert("الرجاء إدخال بيانات صحيحة");
    return;
  }
  
  if (editingProductId) {
    const idx = products.findIndex(p => p.id === editingProductId);
    if (idx !== -1) {
      products[idx] = { ...products[idx], name, price, category, description };
    }
  } else {
    products.push({
      id: cryptoRandomId(),
      name,
      price,
      category,
      description
    });
  }
  
  saveProducts();
  renderProducts(productSearch.value);
  document.getElementById("productFormWrapper").classList.add("hidden");
  editingProductId = null;
  productForm.reset();
  renderProductsList();
}

// Reports
function openReportsModal() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const todaySalesList = sales.filter(s => {
    const saleDate = new Date(s.date);
    saleDate.setHours(0, 0, 0, 0);
    return saleDate.getTime() === today.getTime();
  });
  
  const monthSalesList = sales.filter(s => {
    const saleDate = new Date(s.date);
    return saleDate >= monthStart;
  });
  
  document.getElementById("reportTodaySales").textContent = todaySalesList.length;
  document.getElementById("reportTodayTotal").textContent = `${todaySalesList.reduce((sum, s) => sum + s.total, 0).toFixed(2)} جنيه`;
  document.getElementById("reportMonthSales").textContent = monthSalesList.length;
  document.getElementById("reportMonthTotal").textContent = `${monthSalesList.reduce((sum, s) => sum + s.total, 0).toFixed(2)} جنيه`;
  
  // Top Products
  const productSales = {};
  sales.forEach(sale => {
    sale.items.forEach(item => {
      productSales[item.name] = (productSales[item.name] || 0) + item.quantity;
    });
  });
  
  const topProducts = Object.entries(productSales)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  const topProductsDiv = document.getElementById("topProducts");
  topProductsDiv.innerHTML = "";
  if (topProducts.length === 0) {
    topProductsDiv.innerHTML = "<p>لا توجد بيانات</p>";
  } else {
    topProducts.forEach(([name, qty], idx) => {
      const div = document.createElement("div");
      div.className = "top-product-item";
      div.innerHTML = `
        <span class="rank">${idx + 1}</span>
        <span class="name">${escapeHtml(name)}</span>
        <span class="qty">${qty} قطعة</span>
      `;
      topProductsDiv.appendChild(div);
    });
  }
  
  reportsModal.classList.remove("hidden");
}

function closeReportsModalFunc() {
  reportsModal.classList.add("hidden");
}

// Event Listeners
function setupCashierEvents() {
  // Products
  productsGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add-product]");
    if (btn) {
      const productId = btn.getAttribute("data-add-product");
      addToCart(productId);
    }
  });
  
  productSearch.addEventListener("input", (e) => {
    renderProducts(e.target.value);
  });
  
  // Cart
  cartItems.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (btn) {
      const idx = parseInt(btn.getAttribute("data-remove"));
      removeFromCart(idx);
    }
    
    const decrease = e.target.closest("[data-decrease]");
    if (decrease) {
      const idx = parseInt(decrease.getAttribute("data-decrease"));
      updateQuantity(idx, -1);
    }
    
    const increase = e.target.closest("[data-increase]");
    if (increase) {
      const idx = parseInt(increase.getAttribute("data-increase"));
      updateQuantity(idx, 1);
    }
  });
  
  clearCartBtn.addEventListener("click", () => {
    if (confirm("هل أنت متأكد من مسح السلة؟")) {
      cart = [];
      currentDiscount = 0;
      discountInput.value = "";
      renderCart();
    }
  });
  
  applyDiscountBtn.addEventListener("click", applyDiscount);
  checkoutBtn.addEventListener("click", checkout);
  
  // Product Management
  manageProductsBtn.addEventListener("click", () => openProductModal());
  closeProductModal.addEventListener("click", closeProductModalFunc);
  cancelProductBtn.addEventListener("click", () => {
    document.getElementById("productFormWrapper").classList.add("hidden");
    editingProductId = null;
    productForm.reset();
  });
  document.getElementById("addNewProductBtn").addEventListener("click", () => showProductForm());
  productForm.addEventListener("submit", saveProduct);
  productModal.addEventListener("click", (e) => {
    if (e.target.getAttribute("data-close") === "true") closeProductModalFunc();
    
    const editBtn = e.target.closest("[data-edit-product]");
    if (editBtn) {
      const productId = editBtn.getAttribute("data-edit-product");
      showProductForm(productId);
    }
    
    const deleteBtn = e.target.closest("[data-delete-product]");
    if (deleteBtn) {
      const productId = deleteBtn.getAttribute("data-delete-product");
      deleteProduct(productId);
    }
  });
  
  // Sales
  salesTbody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view-invoice]");
    if (btn) {
      const saleId = btn.getAttribute("data-view-invoice");
      const sale = sales.find(s => s.id === saleId);
      if (sale) showInvoice(sale);
    }
  });
  
  viewReportsBtn.addEventListener("click", openReportsModal);
  closeReportsModal.addEventListener("click", closeReportsModalFunc);
  reportsModal.addEventListener("click", (e) => {
    if (e.target.getAttribute("data-close") === "true") closeReportsModalFunc();
  });
  
  clearHistoryBtn.addEventListener("click", () => {
    if (confirm("هل أنت متأكد من مسح سجل المبيعات؟")) {
      sales = [];
      saveSales();
      renderSales();
      updateStats();
    }
  });
}

// Initialize Cashier
function initCashier() {
  loadProducts();
  loadCart();
  loadSales();
  renderProducts();
  renderCart();
  renderSales();
  updateStats();
  setupCashierEvents();
}

// Update main init
document.addEventListener("DOMContentLoaded", () => {
  init();
  initCashier();
});


