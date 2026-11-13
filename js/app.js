/*
  DUKAPULSE authentication and dashboard V1.
*/

const SUPABASE_URL = "https://lkprnkuvepywmfnmtxqj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_25QiWzrD9BBoooeRDFpj4A_z0Hknzkj";

let supabaseClient = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
}

const views = ["login", "register", "forgot", "reset"];

function showView(viewName) {
  views.forEach(name => {
    document.getElementById(`${name}-view`).classList.toggle(
      "hidden",
      name !== viewName
    );
  });
}

function showAuthScreen(viewName = "login") {
  document.querySelector(".auth-layout").classList.remove("hidden");
  document.getElementById("dashboard-view").classList.add("hidden");
  showView(viewName);
}

let businessLoadUserId = null;
let businessLoadPromise = null;

async function getBusinessRecord(user) {
  if (businessLoadUserId === user.id && businessLoadPromise) {
    return businessLoadPromise;
  }

  businessLoadUserId = user.id;

  businessLoadPromise = (async () => {
    const { data, error } = await supabaseClient
      .from("businesses")
      .select("id, business_name, currency_code")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (error) throw error;

    if (data) return data;

    const businessName =
      user.user_metadata?.business_name ||
      user.email?.split("@")[0] ||
      "Business";

    const { data: created, error: insertError } =
      await supabaseClient
        .from("businesses")
        .insert({
          owner_id: user.id,
          business_name: businessName,
          currency_code: "KES"
        })
        .select("id, business_name, currency_code")
        .single();

    if (insertError) throw insertError;

    return created;
  })();

  try {
    return await businessLoadPromise;
  } catch (error) {
    businessLoadUserId = null;
    businessLoadPromise = null;
    throw error;
  }
}

function showDashboard(user) {
  const authLayout = document.querySelector(".auth-layout");
  const dashboard = document.getElementById("dashboard-view");
  const nameElement = document.getElementById("dashboard-business-name");
  const statusElement = document.getElementById("dashboard-business-status");

  nameElement.textContent =
    user.user_metadata?.business_name ||
    user.email?.split("@")[0] ||
    "Business";

  statusElement.textContent = "Connecting your business records...";

  authLayout.classList.add("hidden");
  dashboard.classList.remove("hidden");

  currentUser = user;

  getBusinessRecord(user)
    .then(business => {
      currentBusinessRecord = business;
      nameElement.textContent = business.business_name;
      statusElement.textContent =
        "Your business records are connected.";
      loadProducts();
      loadDashboardAnalytics();
    })
    .catch(error => {
      statusElement.textContent =
        "Could not load business records. Please refresh and try again.";
      console.error("Business connection failed:", error);
    });
}

function showMessage(id, message) {
  document.getElementById(id).textContent = message;
}

let currentUser = null;
let currentBusinessRecord = null;

function showWorkspaceSection(sectionId) {
  document.querySelectorAll(".workspace-section").forEach(section => {
    section.classList.toggle("hidden", section.id !== sectionId);
  });

  document.querySelectorAll(".dashboard-nav .nav-link").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.section === sectionId
    );
  });

  if (sectionId === "inventory-view") loadProducts();
  if (sectionId === "sales-view") loadSalesWorkspace();
  if (sectionId === "expenses-view") loadExpenses();
  if (sectionId === "reports-view") loadReports();
}

document.querySelectorAll("[data-section]").forEach(button => {
  button.addEventListener("click", () => {
    showWorkspaceSection(button.dataset.section);
  });
});

document.getElementById("show-product-form").addEventListener("click", () => {
  document.getElementById("product-form").classList.remove("hidden");
  document.getElementById("product-name").focus();
});

document.getElementById("cancel-product-form").addEventListener("click", () => {
  document.getElementById("product-form").reset();
  document.getElementById("product-form").classList.add("hidden");
  showMessage("product-message", "");
});

function formatKES(amount) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2
  }).format(Number(amount) || 0);
}

function addTableCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = value;
  row.appendChild(cell);
}


function addTapToRevealDelete(row, recordLabel, deleteHandler) {
  const actionCell = document.createElement("td");
  actionCell.className = "record-action-cell";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "record-delete-button";
  deleteButton.innerHTML = '<span aria-hidden="true">🗑</span>';
  deleteButton.setAttribute("aria-label", `Delete ${recordLabel}`);
  deleteButton.title = "Delete";

  actionCell.appendChild(deleteButton);
  row.appendChild(actionCell);

  row.addEventListener("click", event => {
    if (event.target.closest("button, a, input")) return;

    const wasVisible = row.classList.contains("record-delete-visible");

    document.querySelectorAll(".record-delete-visible")
      .forEach(item => item.classList.remove("record-delete-visible"));

    if (!wasVisible) {
      row.classList.add("record-delete-visible");
    }
  });

  deleteButton.addEventListener("click", async event => {
    event.stopPropagation();

    if (!window.confirm(
      `Permanently delete this ${recordLabel}? This action cannot be undone.`
    )) return;

    deleteButton.disabled = true;
    deleteButton.textContent = "…";

    try {
      await deleteHandler();
    } catch (error) {
      window.alert(error.message || "Could not delete this record.");
      deleteButton.disabled = false;
      deleteButton.innerHTML = '<span aria-hidden="true">🗑</span>';
    }
  });
}

async function deleteProductRecord(product) {
  const { error } = await supabaseClient
    .from("products")
    .delete()
    .eq("id", product.id)
    .eq("business_id", currentBusinessRecord.id);

  if (error) throw error;

  await loadProducts();
  await loadDashboardAnalytics();
  showMessage("inventory-message", "Product deleted successfully.");
}

async function deleteSaleRecord(sale) {
  const { data, error } = await supabaseClient.rpc(
    "delete_sale_and_restore_stock",
    { p_sale_id: sale.id }
  );

  if (error) throw error;

  await loadProducts();
  await loadSaleProducts();
  await loadSalesHistory();
  await loadDashboardAnalytics();

  showMessage(
    "sales-message",
    `Sale deleted. Stock restored for ${data.restored_products} product record(s).`
  );
}

async function deleteExpenseRecord(expense) {
  const { error } = await supabaseClient
    .from("expenses")
    .delete()
    .eq("id", expense.id)
    .eq("business_id", currentBusinessRecord.id);

  if (error) throw error;

  await loadExpenses();
  await loadDashboardAnalytics();
  showMessage("expense-message", "Expense deleted successfully.");
}

async function loadProducts() {
  const tableBody = document.getElementById("inventory-table-body");
  const countLabel = document.getElementById("inventory-count");
  const stockCount = document.getElementById("dashboard-stock-count");
  const stockCaption = document.getElementById("dashboard-stock-caption");

  if (!currentBusinessRecord || !supabaseClient) return;

  tableBody.replaceChildren();
  const loadingRow = document.createElement("tr");
  const loadingCell = document.createElement("td");
  loadingCell.colSpan = 7;
  loadingCell.className = "table-empty";
  loadingCell.textContent = "Loading your inventory...";
  loadingRow.appendChild(loadingCell);
  tableBody.appendChild(loadingRow);

  const { data, error } = await supabaseClient
    .from("products")
    .select("id, product_name, category, cost_price, selling_price, quantity, low_stock_threshold")
    .eq("business_id", currentBusinessRecord.id)
    .order("created_at", { ascending: false });

  tableBody.replaceChildren();

  if (error) {
    countLabel.textContent = "Could not load products.";
    stockCount.textContent = "—";
    stockCaption.textContent = "Inventory unavailable";
    showMessage("inventory-message", error.message);
    return;
  }

  const products = data || [];
  countLabel.textContent = `${products.length} product${products.length === 1 ? "" : "s"}`;
  stockCount.textContent = products.length;
  stockCaption.textContent = "Products in your inventory";

  if (products.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.className = "table-empty";
    cell.textContent = "No products yet. Select Add Product to get started.";
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  products.forEach(product => {
    const row = document.createElement("tr");
    addTableCell(row, product.product_name);
    addTableCell(row, product.category || "Uncategorised");
    addTableCell(row, formatKES(product.cost_price));
    addTableCell(row, formatKES(product.selling_price));
    addTableCell(row, product.quantity);

    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = "stock-status";

    if (Number(product.quantity) <= Number(product.low_stock_threshold)) {
      status.classList.add("low");
      status.textContent = "Low stock";
    } else {
      status.classList.add("available");
      status.textContent = "In stock";
    }

    statusCell.appendChild(status);
    row.appendChild(statusCell);

    addTapToRevealDelete(
      row,
      `product "${product.product_name}"`,
      () => deleteProductRecord(product)
    );

    tableBody.appendChild(row);
  });

  showMessage("inventory-message", "");
}

document.getElementById("product-form").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentBusinessRecord || !currentUser || !supabaseClient) {
    showMessage("product-message", "Your business connection is not ready. Please refresh.");
    return;
  }

  const saveButton = event.submitter;
  if (saveButton) saveButton.disabled = true;

  showMessage("product-message", "Saving product...");

  const product = {
    business_id: currentBusinessRecord.id,
    product_name: document.getElementById("product-name").value.trim(),
    category: document.getElementById("product-category").value.trim() || null,
    sku: document.getElementById("product-sku").value.trim() || null,
    size: document.getElementById("product-size").value.trim() || null,
    color: document.getElementById("product-color").value.trim() || null,
    cost_price: Number(document.getElementById("product-cost").value),
    selling_price: Number(document.getElementById("product-selling").value),
    quantity: Number(document.getElementById("product-quantity").value),
    low_stock_threshold: Number(document.getElementById("product-threshold").value)
  };

  try {
    const { error } = await supabaseClient
      .from("products")
      .insert(product);

    if (error) throw error;

    document.getElementById("product-form").reset();
    document.getElementById("product-form").classList.add("hidden");
    showMessage("product-message", "Product saved successfully.");

    await loadProducts();
  } catch (error) {
    showMessage("product-message", error.message || "Could not save product.");
    console.error("Product save failed:", error);
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
});

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => {
    showAuthScreen(button.dataset.view);
  });
});

document.querySelectorAll("[data-toggle]").forEach(button => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.toggle);
    const visible = input.type === "text";

    input.type = visible ? "password" : "text";
    button.textContent = visible ? "Show" : "Hide";
  });
});

// LOGIN
document.getElementById("login-form").addEventListener("submit", async event => {
  event.preventDefault();

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!supabaseClient) {
    showMessage("login-message", "Supabase is not connected.");
    return;
  }

  showMessage("login-message", "Signing in...");

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showMessage("login-message", error.message);
      return;
    }

    if (data.session && data.user) {
      showDashboard(data.user);
    } else {
      showMessage(
        "login-message",
        "Login completed, but no session was returned. Please try again."
      );
    }
  } catch (error) {
    showMessage("login-message", "Login failed. Please try again.");
    console.error(error);
  }
});

// REGISTRATION
document.getElementById("register-form").addEventListener("submit", async event => {
  event.preventDefault();

  const businessName = document.getElementById("business-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;

  if (!supabaseClient) {
    showMessage("register-message", "Supabase is not connected.");
    return;
  }

  showMessage("register-message", "Creating your account...");

  try {
    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          business_name: businessName
        }
      }
    });

    showMessage(
      "register-message",
      error
        ? error.message
        : "Account created. Check your email for confirmation."
    );
  } catch (error) {
    showMessage("register-message", "Registration failed. Please try again.");
    console.error(error);
  }
});

// PASSWORD RECOVERY
document.getElementById("forgot-form").addEventListener("submit", async event => {
  event.preventDefault();

  const email = document.getElementById("forgot-email").value.trim();

  if (!supabaseClient) {
    showMessage("forgot-message", "Supabase is not connected.");
    return;
  }

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });

    showMessage(
      "forgot-message",
      error
        ? error.message
        : "If this email is registered, a reset link will be sent."
    );
  } catch (error) {
    showMessage("forgot-message", "Password reset request failed.");
    console.error(error);
  }
});

// PASSWORD RECOVERY
document.getElementById("reset-form").addEventListener("submit", async event => {
  event.preventDefault();

  const password = document.getElementById("new-password").value;
  const confirmation = document.getElementById("confirm-password").value;

  if (password.length < 8) {
    showMessage("reset-message", "Password must contain at least 8 characters.");
    return;
  }

  if (password !== confirmation) {
    showMessage("reset-message", "The passwords do not match.");
    return;
  }

  showMessage("reset-message", "Updating your password...");

  try {
    const { data, error } = await supabaseClient.auth.updateUser({
      password
    });

    if (error) {
      showMessage("reset-message", error.message);
      return;
    }

    document.getElementById("reset-form").reset();

    showMessage("reset-message", "Password updated successfully.");

    if (data.user) {
      showDashboard(data.user);
      document.getElementById("dashboard-business-status").textContent =
        "Your password was updated successfully.";
    }
  } catch (error) {
    showMessage("reset-message", "Password update failed. Please try again.");
    console.error("Password update failed:", error);
  }
});

// LOGOUT
document.getElementById("logout-button").addEventListener("click", async () => {
  if (!supabaseClient) return;

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    alert("Could not log out. Please try again.");
    console.error(error);
  } else {
    showAuthScreen("login");
    showMessage("login-message", "You have been signed out.");
  }
});

// RESTORE SESSION AND LISTEN FOR AUTH CHANGES
let passwordRecoveryMode = false;

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      passwordRecoveryMode = true;
      showAuthScreen("reset");
      showMessage("reset-message", "Enter and confirm your new password.");
      return;
    }

    if (event === "SIGNED_OUT") {
      passwordRecoveryMode = false;
      showAuthScreen("login");
    }
  });

  supabaseClient.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.error("Session check failed:", error.message);
      showAuthScreen("login");
      return;
    }

    if (passwordRecoveryMode) {
      showAuthScreen("reset");
    } else if (data.session?.user) {
      showDashboard(data.session.user);
    } else {
      showAuthScreen("login");
    }
  });
} else {
  showAuthScreen("login");
}

// ======================================
// DUKAPULSE SALES MANAGEMENT V1
// ======================================

let availableSaleProducts = [];
let saleCart = [];

async function loadSalesWorkspace() {
  await loadSaleProducts();
  await loadSalesHistory();
}

async function loadSaleProducts() {
  const select = document.getElementById("sale-product");
  const addButton = document.getElementById("add-sale-item");

  if (!currentBusinessRecord || !supabaseClient) return;

  select.replaceChildren();

  const loadingOption = document.createElement("option");
  loadingOption.value = "";
  loadingOption.textContent = "Loading products...";
  select.appendChild(loadingOption);
  addButton.disabled = true;

  const { data, error } = await supabaseClient
    .from("products")
    .select("id, product_name, selling_price, quantity")
    .eq("business_id", currentBusinessRecord.id)
    .order("product_name", { ascending: true });

  if (error) {
    select.replaceChildren();
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Could not load products";
    select.appendChild(option);
    showMessage("sales-message", error.message);
    return;
  }

  availableSaleProducts = data || [];

  select.replaceChildren();

  const firstOption = document.createElement("option");
  firstOption.value = "";
  firstOption.textContent = "Choose a product";
  select.appendChild(firstOption);

  availableSaleProducts.forEach(product => {
    const option = document.createElement("option");
    option.value = product.id;

    option.textContent =
      `${product.product_name} — ${formatKES(product.selling_price)} ` +
      `(Stock: ${product.quantity})`;

    option.disabled = Number(product.quantity) <= 0;
    select.appendChild(option);
  });

  addButton.disabled = availableSaleProducts.every(
    product => Number(product.quantity) <= 0
  );

  if (availableSaleProducts.length === 0) {
    showMessage("sales-message", "Add products to your inventory before recording sales.");
  } else {
    showMessage("sales-message", "");
  }
}

function renderSalesCart() {
  const body = document.getElementById("sales-cart-body");
  const totalElement = document.getElementById("sale-total");

  body.replaceChildren();

  if (saleCart.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "table-empty";
    cell.textContent = "No products added yet.";
    row.appendChild(cell);
    body.appendChild(row);
  }

  let total = 0;

  saleCart.forEach(item => {
    const product = availableSaleProducts.find(
      product => product.id === item.product_id
    );

    if (!product) return;

    const subtotal = Number(product.selling_price) * item.quantity;
    total += subtotal;

    const row = document.createElement("tr");

    addTableCell(row, product.product_name);
    addTableCell(row, formatKES(product.selling_price));
    addTableCell(row, item.quantity);
    addTableCell(row, formatKES(subtotal));

    const actionCell = document.createElement("td");
    const removeButton = document.createElement("button");

    removeButton.type = "button";
    removeButton.className = "sales-remove-button";
    removeButton.textContent = "Remove";

    removeButton.addEventListener("click", () => {
      saleCart = saleCart.filter(
        cartItem => cartItem.product_id !== item.product_id
      );
      renderSalesCart();
    });

    actionCell.appendChild(removeButton);
    row.appendChild(actionCell);
    body.appendChild(row);
  });

  totalElement.textContent = formatKES(total);
}

document.getElementById("add-sale-item").addEventListener("click", () => {
  const productId = document.getElementById("sale-product").value;
  const quantity = Number(document.getElementById("sale-quantity").value);

  const product = availableSaleProducts.find(
    item => item.id === productId
  );

  if (!product) {
    showMessage("sales-message", "Please select a product.");
    return;
  }

  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    showMessage("sales-message", "Enter a valid quantity.");
    return;
  }

  const existing = saleCart.find(
    item => item.product_id === productId
  );

  const alreadyAdded = existing ? existing.quantity : 0;

  if (alreadyAdded + quantity > Number(product.quantity)) {
    showMessage(
      "sales-message",
      `Only ${product.quantity - alreadyAdded} more unit(s) available for ${product.product_name}.`
    );
    return;
  }

  if (existing) {
    existing.quantity += quantity;
  } else {
    saleCart.push({
      product_id: productId,
      quantity
    });
  }

  document.getElementById("sale-quantity").value = 1;
  document.getElementById("sale-product").value = "";

  showMessage("sales-message", "");
  renderSalesCart();
});

async function loadSalesHistory() {
  const body = document.getElementById("sales-history-body");
  const count = document.getElementById("sales-history-count");

  if (!currentBusinessRecord || !supabaseClient) return;

  body.replaceChildren();

  const loadingRow = document.createElement("tr");
  const loadingCell = document.createElement("td");
  loadingCell.colSpan = 5;
  loadingCell.className = "table-empty";
  loadingCell.textContent = "Loading sales...";
  loadingRow.appendChild(loadingCell);
  body.appendChild(loadingRow);

  const { data, error } = await supabaseClient
    .from("sales")
    .select("id, total_amount, payment_method, sold_at")
    .eq("business_id", currentBusinessRecord.id)
    .order("sold_at", { ascending: false })
    .limit(20);

  body.replaceChildren();

  if (error) {
    count.textContent = "Could not load sales history.";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "table-empty";
    cell.textContent = error.message;
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  const sales = data || [];
  count.textContent = `${sales.length} recent transaction${sales.length === 1 ? "" : "s"}`;

  if (sales.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "table-empty";
    cell.textContent = "No sales recorded yet.";
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  sales.forEach(sale => {
    const row = document.createElement("tr");

    const date = new Date(sale.sold_at).toLocaleString("en-KE", {
      dateStyle: "medium",
      timeStyle: "short"
    });

    addTableCell(row, date);
    addTableCell(row, formatKES(sale.total_amount));
    addTableCell(row, sale.payment_method);

    addTapToRevealDelete(
      row,
      "sale",
      () => deleteSaleRecord(sale)
    );

    body.appendChild(row);
  });
}

document.getElementById("complete-sale").addEventListener("click", async () => {
  const button = document.getElementById("complete-sale");

  if (!currentBusinessRecord || !currentUser || !supabaseClient) {
    showMessage("sales-message", "Business connection is not ready. Refresh and try again.");
    return;
  }

  if (saleCart.length === 0) {
    showMessage("sales-message", "Add at least one product before completing a sale.");
    return;
  }

  button.disabled = true;
  button.textContent = "Processing sale...";
  showMessage("sales-message", "Saving your sale securely...");

  try {
    const paymentMethod =
      document.getElementById("sale-payment-method").value;

    const { data, error } = await supabaseClient.rpc("record_sale", {
      p_business_id: currentBusinessRecord.id,
      p_payment_method: paymentMethod,
      p_items: saleCart.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity
      }))
    });

    if (error) throw error;

    saleCart = [];
    renderSalesCart();

    showMessage(
      "sales-message",
      `Sale saved successfully! Total: ${formatKES(data.total_amount)}`
    );

    await loadProducts();
    await loadSaleProducts();
    await loadSalesHistory();
    await loadDashboardAnalytics();

  } catch (error) {
    showMessage(
      "sales-message",
      error.message || "Could not complete the sale."
    );
    console.error("Sale failed:", error);
  } finally {
    button.disabled = false;
    button.textContent = "Complete Sale";
  }
});

// ======================================
// DUKAPULSE EXPENSE MANAGEMENT V1
// ======================================

function setDefaultExpenseDate() {
  const input = document.getElementById("expense-date");
  if (!input || input.value) return;

  const now = new Date();
  const localDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  input.value = localDate;
}

async function loadExpenses() {
  const body = document.getElementById("expense-history-body");
  const count = document.getElementById("expense-history-count");

  if (!currentBusinessRecord || !supabaseClient) return;

  body.replaceChildren();

  const loadingRow = document.createElement("tr");
  const loadingCell = document.createElement("td");
  loadingCell.colSpan = 4;
  loadingCell.className = "table-empty";
  loadingCell.textContent = "Loading expenses...";
  loadingRow.appendChild(loadingCell);
  body.appendChild(loadingRow);

  const { data, error } = await supabaseClient
    .from("expenses")
    .select("id, description, category, amount, spent_at")
    .eq("business_id", currentBusinessRecord.id)
    .order("spent_at", { ascending: false })
    .limit(50);

  body.replaceChildren();

  if (error) {
    count.textContent = "Could not load expenses.";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "table-empty";
    cell.textContent = error.message;
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  const expenses = data || [];
  count.textContent =
    `${expenses.length} recorded expense${expenses.length === 1 ? "" : "s"}`;

  if (expenses.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "table-empty";
    cell.textContent = "No expenses recorded yet.";
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  expenses.forEach(expense => {
    const row = document.createElement("tr");

    const date = new Date(expense.spent_at).toLocaleDateString("en-KE", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });

    addTableCell(row, date);
    addTableCell(row, expense.description);
    addTableCell(row, expense.category);
    addTableCell(row, formatKES(expense.amount));

    addTapToRevealDelete(
      row,
      `expense "${expense.description}"`,
      () => deleteExpenseRecord(expense)
    );

    body.appendChild(row);
  });
}

setDefaultExpenseDate();

document.getElementById("expense-form").addEventListener("submit", async event => {
  event.preventDefault();

  const button = document.getElementById("save-expense");
  const description = document
    .getElementById("expense-description").value.trim();
  const category = document.getElementById("expense-category").value;
  const amount = Number(
    document.getElementById("expense-amount").value
  );
  const expenseDate = document.getElementById("expense-date").value;

  if (!currentUser || !currentBusinessRecord || !supabaseClient) {
    showMessage("expense-message", "Business connection is not ready. Refresh and try again.");
    return;
  }

  if (!description || !category || !expenseDate ||
      !Number.isFinite(amount) || amount <= 0) {
    showMessage("expense-message", "Please enter a description, category, valid amount and date.");
    return;
  }

  button.disabled = true;
  button.textContent = "Saving expense...";
  showMessage("expense-message", "Saving your expense...");

  try {
    const spentAt = new Date(
      `${expenseDate}T12:00:00`
    ).toISOString();

    const { error } = await supabaseClient
      .from("expenses")
      .insert({
        business_id: currentBusinessRecord.id,
        recorded_by: currentUser.id,
        description,
        category,
        amount,
        spent_at: spentAt
      });

    if (error) throw error;

    document.getElementById("expense-form").reset();
    setDefaultExpenseDate();

    showMessage("expense-message", "Expense saved successfully!");

    await loadExpenses();
    await loadDashboardAnalytics();

  } catch (error) {
    showMessage(
      "expense-message",
      error.message || "Could not save this expense."
    );
    console.error("Expense save failed:", error);
  } finally {
    button.disabled = false;
    button.textContent = "Save Expense";
  }
});


// ==========================================
// DUKAPULSE BUSINESS REPORTS
// ==========================================

function setDefaultReportDates() {
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  const firstDay = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    "01"
  ].join("-");

  document.getElementById("report-start-date").value = firstDay;
  document.getElementById("report-end-date").value = today;
}

function reportDateToISO(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).toISOString();
}

function reportNextDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const next = new Date(year, month - 1, day + 1);

  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, "0"),
    String(next.getDate()).padStart(2, "0")
  ].join("-");
}

async function loadReports() {
  const message = document.getElementById("report-message");
  const button = document.getElementById("load-reports");

  if (!currentBusinessRecord || !currentUser || !supabaseClient) {
    message.textContent = "Please sign in to view your business reports.";
    return;
  }

  const startDate = document.getElementById("report-start-date").value;
  const endDate = document.getElementById("report-end-date").value;

  if (!startDate || !endDate || startDate > endDate) {
    message.textContent = "Please select a valid report date range.";
    return;
  }

  button.disabled = true;
  button.textContent = "Generating...";
  message.textContent = "Calculating your business performance...";

  try {
    const startISO = reportDateToISO(startDate);
    const endISO = reportDateToISO(reportNextDate(endDate));

    const [salesResult, expensesResult] = await Promise.all([
      supabaseClient
        .from("sales")
        .select("id, total_amount, sold_at")
        .eq("business_id", currentBusinessRecord.id)
        .gte("sold_at", startISO)
        .lt("sold_at", endISO),

      supabaseClient
        .from("expenses")
        .select("category, amount, spent_at")
        .eq("business_id", currentBusinessRecord.id)
        .gte("spent_at", startISO)
        .lt("spent_at", endISO)
    ]);

    if (salesResult.error) throw salesResult.error;
    if (expensesResult.error) throw expensesResult.error;

    const sales = salesResult.data || [];
    const expenses = expensesResult.data || [];
    const saleIds = sales.map(sale => sale.id);

    let saleItems = [];

    if (saleIds.length > 0) {
      const itemsResult = await supabaseClient
        .from("sale_items")
        .select("sale_id, quantity, unit_cost_price")
        .in("sale_id", saleIds);

      if (itemsResult.error) throw itemsResult.error;
      saleItems = itemsResult.data || [];
    }

    const revenue = sales.reduce(
      (sum, sale) => sum + Number(sale.total_amount || 0), 0
    );

    const cogs = saleItems.reduce(
      (sum, item) =>
        sum + Number(item.quantity || 0) *
        Number(item.unit_cost_price || 0), 0
    );

    const operatingExpenses = expenses
      .filter(expense => expense.category !== "Stock Purchase")
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const stockPurchases = expenses
      .filter(expense => expense.category === "Stock Purchase")
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - operatingExpenses;

    document.getElementById("report-revenue").textContent =
      formatKES(revenue);

    document.getElementById("report-cogs").textContent =
      formatKES(cogs);

    document.getElementById("report-expenses").textContent =
      formatKES(operatingExpenses);

    document.getElementById("report-profit").textContent =
      formatKES(netProfit);

    document.getElementById("report-stock-purchases").textContent =
      formatKES(stockPurchases);

    document.getElementById("report-gross-profit").textContent =
      formatKES(grossProfit);

    document.getElementById("report-sales-count").textContent =
      `${sales.length} recorded sale${sales.length === 1 ? "" : "s"}`;

    const expenseBody = document.getElementById("report-expense-body");
    expenseBody.replaceChildren();

    const categories = {};

    expenses.forEach(expense => {
      const category = expense.category || "Other";

      if (!categories[category]) {
        categories[category] = { count: 0, total: 0 };
      }

      categories[category].count += 1;
      categories[category].total += Number(expense.amount || 0);
    });

    const categoryNames = Object.keys(categories).sort();

    if (categoryNames.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.className = "table-empty";
      cell.textContent = "No expenses recorded in this period.";
      row.appendChild(cell);
      expenseBody.appendChild(row);
    } else {
      categoryNames.forEach(category => {
        const row = document.createElement("tr");
        addTableCell(row, category);
        addTableCell(row, categories[category].count);
        addTableCell(row, formatKES(categories[category].total));
        expenseBody.appendChild(row);
      });
    }

    message.textContent =
      `Report generated successfully for ${startDate} to ${endDate}.`;

  } catch (error) {
    console.error("Reports error:", error);
    message.textContent =
      error.message || "Could not generate your business report.";
  } finally {
    button.disabled = false;
    button.textContent = "Generate Report";
  }
}

setDefaultReportDates();

document.getElementById("load-reports").addEventListener("click", loadReports);


/* ==========================================
   DUKAPULSE DASHBOARD ANALYTICS
========================================== */

async function loadDashboardAnalytics() {
  if (!currentBusinessRecord || !currentUser || !supabaseClient) return;

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  const localDateString = date => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");

  const now = new Date();
  const today = localDateString(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const startISO = monthStart.toISOString();
  const endISO = tomorrow.toISOString();

  const salesElement = document.getElementById("dashboard-recent-activity");
  const stockElement = document.getElementById("dashboard-low-stock-list");

  try {
    const [salesResult, expensesResult, productsResult] = await Promise.all([
      supabaseClient
        .from("sales")
        .select("id, total_amount, sold_at")
        .eq("business_id", currentBusinessRecord.id)
        .gte("sold_at", startISO)
        .lt("sold_at", endISO),

      supabaseClient
        .from("expenses")
        .select("description, category, amount, spent_at")
        .eq("business_id", currentBusinessRecord.id)
        .gte("spent_at", startISO)
        .lt("spent_at", endISO),

      supabaseClient
        .from("products")
        .select("product_name, quantity, low_stock_threshold")
        .eq("business_id", currentBusinessRecord.id)
        .order("product_name", { ascending: true })
    ]);

    if (salesResult.error) throw salesResult.error;
    if (expensesResult.error) throw expensesResult.error;
    if (productsResult.error) throw productsResult.error;

    const sales = salesResult.data || [];
    const expenses = expensesResult.data || [];
    const products = productsResult.data || [];

    const todaysSales = sales.filter(
      sale => localDateString(new Date(sale.sold_at)) === today
    );

    const todaysExpenses = expenses.filter(
      expense => localDateString(new Date(expense.spent_at)) === today
    );

    const operatingExpenses = todaysExpenses.filter(
      expense => expense.category !== "Stock Purchase"
    );

    const todayRevenue = todaysSales.reduce(
      (sum, sale) => sum + Number(sale.total_amount || 0), 0
    );

    const todayExpenseTotal = operatingExpenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0), 0
    );

    const monthRevenue = sales.reduce(
      (sum, sale) => sum + Number(sale.total_amount || 0), 0
    );

    let todayCOGS = 0;
    const saleIds = todaysSales.map(sale => sale.id);

    if (saleIds.length > 0) {
      const itemsResult = await supabaseClient
        .from("sale_items")
        .select("quantity, unit_cost_price")
        .in("sale_id", saleIds);

      if (itemsResult.error) throw itemsResult.error;

      todayCOGS = (itemsResult.data || []).reduce(
        (sum, item) =>
          sum + Number(item.quantity || 0) *
          Number(item.unit_cost_price || 0), 0
      );
    }

    const todayProfit = todayRevenue - todayCOGS - todayExpenseTotal;

    setText("dashboard-today-sales", formatKES(todayRevenue));
    setText(
      "dashboard-today-sales-caption",
      `${todaysSales.length} sale${todaysSales.length === 1 ? "" : "s"} recorded today`
    );

    setText("dashboard-today-expenses", formatKES(todayExpenseTotal));
    setText(
      "dashboard-today-expenses-caption",
      `${operatingExpenses.length} operating expense${operatingExpenses.length === 1 ? "" : "s"} today`
    );

    setText("dashboard-today-profit", formatKES(todayProfit));
    setText(
      "dashboard-today-profit-caption",
      "After product costs and operating expenses"
    );

    setText("dashboard-month-sales", formatKES(monthRevenue));
    setText(
      "dashboard-month-sales-caption",
      `${sales.length} sale${sales.length === 1 ? "" : "s"} this month`
    );

    // Low-stock products
    const lowStock = products.filter(
      product => Number(product.quantity) <= Number(product.low_stock_threshold)
    );

    setText(
      "dashboard-low-stock-count",
      `${lowStock.length} product${lowStock.length === 1 ? "" : "s"} need attention`
    );

    stockElement.replaceChildren();

    if (lowStock.length === 0) {
      const empty = document.createElement("p");
      empty.className = "overview-empty";
      empty.textContent = products.length
        ? "All products are above their low-stock limits."
        : "Add products to start monitoring stock.";
      stockElement.appendChild(empty);
    } else {
      lowStock.slice(0, 6).forEach(product => {
        const entry = document.createElement("div");
        entry.className = "overview-entry";

        const details = document.createElement("div");
        const name = document.createElement("strong");
        const quantity = document.createElement("small");

        name.textContent = product.product_name;
        quantity.textContent =
          `Available: ${product.quantity} · Alert at: ${product.low_stock_threshold}`;

        details.append(name, quantity);

        const badge = document.createElement("span");
        badge.className = "overview-alert";
        badge.textContent = "Low stock";

        entry.append(details, badge);
        stockElement.appendChild(entry);
      });
    }

    // Recent sales and expenses
    const activity = [
      ...sales.map(sale => ({
        title: "Sale recorded",
        amount: Number(sale.total_amount || 0),
        date: sale.sold_at,
        type: "sale"
      })),
      ...expenses.map(expense => ({
        title: expense.description || expense.category || "Expense",
        amount: Number(expense.amount || 0),
        date: expense.spent_at,
        type: "expense"
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    salesElement.replaceChildren();

    if (activity.length === 0) {
      const empty = document.createElement("p");
      empty.className = "overview-empty";
      empty.textContent = "No sales or expenses recorded this month yet.";
      salesElement.appendChild(empty);
    } else {
      activity.slice(0, 6).forEach(item => {
        const entry = document.createElement("div");
        entry.className = "overview-entry";

        const details = document.createElement("div");
        const title = document.createElement("strong");
        const date = document.createElement("small");

        title.textContent = item.title;
        date.textContent = new Date(item.date).toLocaleString("en-KE", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit"
        });

        details.append(title, date);

        const amount = document.createElement("strong");
        amount.className = item.type === "sale"
          ? "activity-income"
          : "activity-expense";

        amount.textContent =
          `${item.type === "sale" ? "+" : "−"}${formatKES(item.amount)}`;

        entry.append(details, amount);
        salesElement.appendChild(entry);
      });
    }

  } catch (error) {
    console.error("Dashboard analytics failed:", error);

    setText("dashboard-today-sales", "Unavailable");
    setText("dashboard-today-expenses", "Unavailable");
    setText("dashboard-today-profit", "Unavailable");
    setText("dashboard-month-sales", "Unavailable");
    setText("dashboard-low-stock-count", "Could not load stock alerts");

    if (stockElement) {
      stockElement.textContent = "Could not load inventory alerts.";
    }

    if (salesElement) {
      salesElement.textContent = "Could not load recent activity.";
    }
  }
}
