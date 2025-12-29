// بيانات منتجات أولية — يمكنك استبدالها بقاعدة بيانات لاحقاً
const seedProducts = [
  { sku: "1001", name: "قهوة أمريكانو", price: 35 },
  { sku: "1002", name: "كابتشينو", price: 35 },
  { sku: "2001", name: "مياه معدنية", price: 15 },
  { sku: "3002", name: "سموزي مانجا", price: 55 },
  { sku: "3003", name: "سموزي فراوله", price: 55 },
  { sku: "3005", name: "ساعه غرفه عاديه", price: 30 },
  { sku: "3006", name: "قهوه سبريسو", price: 50 },
  { sku: "3007", name: "صن شاين", price: 70 },
  { sku: "3008", name: "قهوه فرنساوي ", price: 30 },



];

const state = {
  products: JSON.parse(localStorage.getItem("pos-products") || "null") || seedProducts,
  cart: [],
  discount: 0,
  tax: 0,
};

const el = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toFixed(2);

function saveProducts() {
  localStorage.setItem("pos-products", JSON.stringify(state.products));
}

function renderDate() {
  const now = new Date();
  el("pos-date").textContent = now.toLocaleString("ar-EG");
}

function renderCatalog() {
  const list = document.getElementById("product-list");
  list.innerHTML = "";
  state.products.forEach(p => {
    const card = document.createElement("div");
    card.className = "product";
    card.innerHTML = `<h4>${p.name}</h4><div class="sku">#${p.sku}</div><div class="price">${fmt(p.price)} ج.م</div>`;
    card.onclick = () => addToCart(p.sku, 1);
    list.appendChild(card);
  });
}

function addToCart(sku, qty) {
  qty = Number(qty) || 1;
  const product = state.products.find(p => p.sku === sku || p.name.trim() === sku.trim());
  if (!product) return alert("المنتج غير موجود");
  const existing = state.cart.find(i => i.sku === product.sku);
  if (existing) existing.qty += qty;
  else state.cart.push({ sku: product.sku, name: product.name, price: product.price, qty });
  renderCart();
}

function removeFromCart(sku) {
  state.cart = state.cart.filter(i => i.sku !== sku);
  renderCart();
}

function updateQty(sku, qty) {
  const item = state.cart.find(i => i.sku === sku);
  if (!item) return;
  item.qty = Math.max(1, Number(qty)||1);
  renderCart();
}

function calcTotals() {
  const sub = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discAmt = sub * (Number(state.discount) / 100);
  const taxed = (sub - discAmt);
  const taxAmt = taxed * (Number(state.tax) / 100);
  const grand = taxed + taxAmt;
  return { sub, discAmt, taxAmt, grand };
}

function renderCart() {
  const body = el("cart-body");
  body.innerHTML = "";
  state.cart.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${fmt(item.price)}</td>
      <td>
        <input type="number" min="1" value="${item.qty}" style="width:80px" />
      </td>
      <td>${fmt(item.price * item.qty)}</td>
      <td><button data-sku="${item.sku}">✕</button></td>
    `;
    body.appendChild(tr);
    tr.querySelector("input").oninput = (e) => updateQty(item.sku, e.target.value);
    tr.querySelector("button").onclick = () => removeFromCart(item.sku);
  });

  const { sub, discAmt, taxAmt, grand } = calcTotals();
  el("sub-total").textContent = fmt(sub);
  el("discount-amt").textContent = fmt(discAmt);
  el("tax-amt").textContent = fmt(taxAmt);
  el("grand-total").textContent = fmt(grand);
}

function bindUI() {
  el("discount-input").oninput = e => { state.discount = Number(e.target.value)||0; renderCart(); };
  el("tax-input").oninput = e => { state.tax = Number(e.target.value)||0; renderCart(); };

  el("add-btn").onclick = () => {
    const codeOrName = el("scan-input").value.trim();
    const qty = el("qty-input").value;
    if (!codeOrName) return;
    addToCart(codeOrName, qty);
    el("scan-input").value = "";
    el("qty-input").value = 1;
    el("scan-input").focus();
  };

  el("clear-btn").onclick = () => {
    if (confirm("تأكيد تفريغ السلة؟")) { state.cart = []; renderCart(); }
  };

  el("pay-btn").onclick = () => {
    if (!state.cart.length) return alert("السلة فارغة");
    printReceipt();
    saveSale();
    state.cart = [];
    renderCart();
  };

  // Enter لإضافة المنتج بسرعة
  el("scan-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") el("add-btn").click();
  });
}

function buildReceiptHTML() {
  const receipt = el("receipt");
  const meta = el("receipt-meta");
  const rbody = el("receipt-body");
  const rtot = el("receipt-totals");
  const now = new Date();

  meta.textContent = now.toLocaleString("ar-EG");
  rbody.innerHTML = "";
  state.cart.forEach(i => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i.name}</td><td>${fmt(i.price)}</td><td>${i.qty}</td><td>${fmt(i.price * i.qty)}</td>`;
    rbody.appendChild(tr);
  });

  const { sub, discAmt, taxAmt, grand } = calcTotals();
  rtot.innerHTML = `
    <div>المجموع الفرعي: ${fmt(sub)}</div>
    <div>الخصم: ${fmt(discAmt)}</div>
    <div>الضريبة: ${fmt(taxAmt)}</div>
    <div><strong>الإجمالي: ${fmt(grand)} ج.م</strong></div>
  `;
  return receipt;
}

function printReceipt() {
  buildReceiptHTML();
  window.print();
}

// حفظ مبيعات بسيطة محلياً (تطوير لاحقاً للتقارير)
function saveSale() {
  const sales = JSON.parse(localStorage.getItem("pos-sales") || "[]");
  const { sub, discAmt, taxAmt, grand } = calcTotals();
  sales.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    items: state.cart,
    totals: { sub, discAmt, taxAmt, grand }
  });
  localStorage.setItem("pos-sales", JSON.stringify(sales));
}

document.addEventListener("DOMContentLoaded", () => {
  renderDate();
  renderCatalog();
  bindUI();
  renderCart();
  // جرّب: كتابة SKU أو اسم المنتج في خانة المسح
});
