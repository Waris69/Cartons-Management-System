import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { ENV } from "./env.js";

const app = initializeApp(ENV);
const db = getFirestore(app);
const ref = doc(db, "carton", "data");

let editingIndex = null;

let state = {
  lifetimeCartons: 0,
  lifetimeRevenue: 0,
  total: 0,
  received: 0,
  entries: [],
  allEntries: [],
  manualReceived: 0,
  openDate: null
};

const loading = document.getElementById("loading");
const showLoading = () => loading.style.display = "flex";
const hideLoading = () => loading.style.display = "none";

async function render() {
  document.getElementById("lifeCartons").innerText = state.lifetimeCartons;
  document.getElementById("lifeRevenue").innerText = state.lifetimeRevenue;
  document.getElementById("total").innerText = state.total;
  document.getElementById("received").innerText = state.received;
  document.getElementById("remaining").innerText = state.total - state.received;
  document.getElementById("closeBtn").disabled = state.total === 0;

  const entries = document.getElementById("entries");
  entries.innerHTML = "";

  // Build entries HTML with customer balance info
  const entryPromises = state.entries.map(async (e, i) => {
    const customer = await getCustomer(e.name);
    const balanceClass = customer && customer.outstandingBalance > 0 ? 'owing' : 'paid';
    return `
      <div class="entry">
        <span class="customer-name" onclick="openCustomerDetail('${e.name}')">
  ${e.name}
</span>
        <input value="${e.packets}" disabled>
        <input value="${e.amount}" disabled>
        <button onclick="editEntry(${i})">Edit</button>
        <button onclick="pay(${i})">Paid</button>
      </div>`;
  });

  const entryHtmls = await Promise.all(entryPromises);
  entries.innerHTML = entryHtmls.join('');
}

async function load() {
  showLoading();

  const snap = await getDoc(ref);
  if (snap.exists()) {
    state = snap.data();

    // 🧹 Normalize legacy fields
    state.lifetimeCartons ??= 0;
    state.lifetimeRevenue ??= 0;
    state.total ??= 0;
    state.received ??= 0;
    state.entries ??= [];
    state.allEntries ??= [];
    state.manualReceived ??= 0;
    state.openDate ??= null;
  }

  hideLoading();
  render();
}


async function save() {
  showLoading();
  await setDoc(ref, state);
  hideLoading();
  render();
}

/* Actions */
window.openCartonPopup = () =>
  document.getElementById("cartonPopup").style.display = "flex";

window.saveCarton = () => {
  const packets = Number(document.getElementById("packetCount").value);
  if (!packets) return alert("Enter packets");
  state.total = packets * 2500;
  state.openDate = new Date();
  document.getElementById("cartonPopup").style.display = "none";
  save();
};

window.addEntry = () => {
  editingIndex = null;
  document.getElementById("entryTitle").innerText = "Add Packet Entry";
  document.getElementById("entryName").value = "";
  document.getElementById("entryPackets").value = "";
  document.getElementById("entryAmount").value = "";
  document.getElementById("entryPopup").style.display = "flex";
};

window.editEntry = i => {
  editingIndex = i;
  const e = state.entries[i];
  document.getElementById("entryTitle").innerText = "Edit Packet Entry";
  document.getElementById("entryName").value = e.name;
  document.getElementById("entryPackets").value = e.packets;
  document.getElementById("entryAmount").value = e.amount;
  document.getElementById("entryPopup").style.display = "flex";
};

window.saveEntry = async () => {
  const name = entryName.value.trim();
  const packets = Number(entryPackets.value);
  const amount = Number(entryAmount.value || packets * 2500);

  if (!name || !packets || !amount) {
    alert("Fill all fields");
    return;
  }

  const entry = {
    name,
    packets,
    amount
  };

  if (editingIndex !== null) {
    // Update existing entry
    state.entries[editingIndex] = entry;

    // Also update allEntries (assuming it's in same order, you might want to sync)
    // Find the entry in allEntries by matching old name or by index if same
    // For simplicity, update by index if safe:
    if (state.allEntries.length > editingIndex) {
      state.allEntries[editingIndex] = entry;
    }

    // TODO: You may want to update customer ledger here to reflect changed purchase amounts.
    // But this requires more complex logic, such as tracking ledger IDs, and adjusting totals.
    // For now, you can alert user that ledger update is not supported on edit.
    // alert("Editing entries does not update ledger. To adjust ledger, create a new entry or contact admin.");

  } else {
    // New entry
    state.entries.push(entry);
    state.allEntries.push(entry);

    await updateCustomerLedger({
      name,
      type: "purchase",
      packets,
      amount,
      cartonUid: `CRT-${String(state.lifetimeCartons + 1).padStart(6, "0")}`
    });
  }

  document.getElementById("entryPopup").style.display = "none";
  save();
};




window.pay = async (index) => {
  const entry = state.entries[index];

  const payAmount = prompt(
    `Outstanding: Rs ${entry.amount}\nEnter payment amount:`,
    entry.amount
  );

  if (!payAmount) return;

  const amount = Number(payAmount);
  if (amount <= 0 || amount > entry.amount) {
    alert("Invalid payment amount");
    return;
  }

  entry.amount -= amount;
  state.received += amount;

  await updateCustomerLedger({
    name: entry.name,
    type: "payment",
    amount,
    cartonUid: `CRT-${String(state.lifetimeCartons + 1).padStart(6, "0")}`
  });

  if (entry.amount === 0) {
    state.entries.splice(index, 1);
  }

  save();
};



window.manualReceive = async () => {
  const amt = Number(manualAmount.value);
  if (!amt) return;

  state.received += amt;
  state.manualReceived += amt;

  await updateCustomerLedger({
    name: "MANUAL",
    type: "payment",
    amount: amt,
    cartonUid: `CRT-${String(state.lifetimeCartons + 1).padStart(6, "0")}`
  });

  manualAmount.value = "";
  save();
};


window.closeCarton = async () => {
  if (!state.total) {
    alert("No active carton to close");
    return;
  }

  if (!confirm("Are you sure you want to close this carton?")) return;

  showLoading();

  const cartonNumber = state.lifetimeCartons + 1;
  const cartonUid = `CRT-${String(cartonNumber).padStart(6, "0")}`;

  const historyPayload = {
    cartonUid,
    cartonNumber,

    openDate: state.openDate || new Date(),
    closeDate: new Date(),

    financials: {
      total: state.total,
      received: state.received,
      manualReceived: state.manualReceived,
      remaining: state.total - state.received
    },

    entries: state.allEntries.map(e => ({
      name: e.name,
      packets: e.packets,
      amount: e.amount,
      status: "paid"
    })),

    audit: {
      closedBy: "system",
      closedAt: new Date(),
      version: 1
    }
  };

  // 🔐 Save immutable history
  await addDoc(collection(db, "cartonHistory"), historyPayload);

  // 🔄 Update lifetime stats
  state.lifetimeCartons++;
  state.lifetimeRevenue += state.received;

  // ♻ Reset current carton
  state.total = 0;
  state.received = 0;
  state.entries = [];
  state.allEntries = [];
  state.manualReceived = 0;
  state.openDate = null;

  hideLoading();
  await save();
};

entryPackets.addEventListener("input", e => {
  entryAmount.value = e.target.value * 2500;
});

/* Customer Functions */
async function updateCustomerLedger({
  name,
  type,
  packets = 0,
  amount,
  cartonUid
}) {
  const ref = doc(db, "customers", name);
  const snap = await getDoc(ref);

  let customer = {
    name,
    totals: {
      totalPurchased: 0,
      totalPaid: 0,
      outstandingBalance: 0
    },
    ledger: [],
    lastUpdated: new Date()
  };

  if (snap.exists()) customer = snap.data();

  if (type === "purchase") {
    const id = generateLedgerId();

    customer.ledger.push({
      id,
      type: "purchase",
      packets,
      amount,
      paid: 0,
      remaining: amount,
      cartonUid,
      date: new Date()
    });

    customer.totals.totalPurchased += amount;
  }

  if (type === "payment") {
    let remainingPayment = amount;
    const appliedTo = [];

    for (let l of customer.ledger) {
      if (l.type === "purchase" && l.remaining > 0 && remainingPayment > 0) {
        const applied = Math.min(l.remaining, remainingPayment);
        l.paid += applied;
        l.remaining -= applied;
        remainingPayment -= applied;
        appliedTo.push(l.id);
      }
    }

    customer.ledger.push({
      id: generateLedgerId(),
      type: "payment",
      amount,
      appliedTo,
      cartonUid,
      date: new Date()
    });

    customer.totals.totalPaid += amount;
  }

  customer.totals.outstandingBalance =
    customer.totals.totalPurchased - customer.totals.totalPaid;

  customer.lastUpdated = new Date();

  await setDoc(ref, customer);
}


async function getCustomer(name) {
  const customerRef = doc(db, "customers", name);
  const snap = await getDoc(customerRef);
  return snap.exists() ? snap.data() : null;
}

window.openCustomerDetail = async function (name) {
  try {
    showLoading();

    // Fetch customer document by name (assumes name is document ID)
    const customerRef = doc(db, "customers", name);
    const customerSnap = await getDoc(customerRef);

    hideLoading();

    if (!customerSnap.exists()) {
      alert(`No data found for customer: ${name}`);
      return;
    }

    const customer = customerSnap.data();

    // Set customer name in popup title
    document.getElementById("customerTitle").innerText = "Ledger — " + name;

    // Safe extraction of totals with fallback
    const totals = {
      totalPurchased: customer.totalPackets || 0,
      totalPaid: customer.totalPaid || 0,
      outstandingBalance: customer.outstandingBalance || 0,
    };

    document.getElementById("customerSummary").innerHTML = `
      <p><strong>Total Purchased:</strong> Rs ${customer.totals.totalPurchased}</p>
      <p><strong>Total Paid:</strong> Rs ${customer.totals.totalPaid}</p>
      <p><strong>Outstanding:</strong> Rs ${customer.totals.outstandingBalance}</p>
    `;

    // Render ledger entries or fallback message
    // const ledger = customer.transactionHistory || [];

    if (customer.ledger.length == 0) {
      document.getElementById("customerHistory").innerHTML = "<p>No transactions found.</p>";
    } else {
      document.getElementById("customerHistory").innerHTML = customer.ledger.map(tx => {
        // Handle Firestore timestamp safely
        const txDate = tx.date && tx.date.seconds
          ? new Date(tx.date.seconds * 1000).toLocaleString()
          : (tx.date ? new Date(tx.date).toLocaleString() : '');

        if (tx.type === 'purchase') {
          return `
            <div class="transaction purchase">
              🛒 <strong>Purchase</strong><br>
              Packets: ${tx.packets || ''}<br>
              Amount: Rs ${tx.amount || ''}<br>
              <small>Date: ${txDate}</small><br>
              <small>Carton ID: ${tx.cartonUid || ''}</small>
            </div>
          `;
        } else if (tx.type === 'payment') {
          return `
            <div class="transaction payment">
              💰 <strong>Payment</strong><br>
              Amount: Rs ${tx.amount || ''}<br>
              <small>Date: ${txDate}</small><br>
              <small>Carton ID: ${tx.cartonUid || ''}</small>
            </div>
          `;
        } else {
          return `<div class="transaction">Unknown transaction type</div>`;
        }
      }).join('');
    }

    // Show the popup
    document.getElementById("customerPopup").style.display = "flex";

  } catch (error) {
    hideLoading();
    console.error("Error opening customer details:", error);
    alert("Failed to load customer data.");
  }
};




window.closeCustomerPopup = function () {
  document.getElementById("customerPopup").style.display = "none";
};



window.closeCustomerModal = () => {
  document.getElementById("customerModal").style.display = "none";
};

/* History Functions */
let historyData = null;

window.toggleHistoryView = async () => {
  const historyView = document.getElementById("historyView");
  const mainView = document.querySelector(".container > :not(#historyView)");

  if (historyView.style.display === "none") {
    // Show history
    historyView.style.display = "block";
    document.querySelectorAll(".container > :not(#historyView)").forEach(el => {
      if (el.tagName !== "H1") el.style.display = "none";
    });

    if (!historyData) {
      await loadHistory();
    }
  } else {
    // Show main view
    historyView.style.display = "none";
    document.querySelectorAll(".container > :not(#historyView)").forEach(el => {
      el.style.display = "";
    });
  }
};

async function loadHistory() {
  showLoading();
  try {
    const q = query(collection(db, "cartonHistory"), orderBy("closeDate", "desc"));
    const querySnapshot = await getDocs(q);
    historyData = [];
    querySnapshot.forEach((doc) => {
      historyData.push({ id: doc.id, ...doc.data() });
    });
    renderHistory();
  } catch (error) {
    console.error("Error loading history:", error);
    document.getElementById("historyContent").innerHTML = "<p>Error loading history</p>";
  }
  hideLoading();
}

function renderHistory() {
  const content = document.getElementById("historyContent");

  if (!historyData || historyData.length === 0) {
    content.innerHTML = "<p>No carton history available</p>";
    return;
  }

  content.innerHTML = historyData.map(cart => {
    const openDate = cart.openDate?.seconds
      ? new Date(cart.openDate.seconds * 1000)
      : new Date(cart.openDate);

    const closeDate = cart.closeDate?.seconds
      ? new Date(cart.closeDate.seconds * 1000)
      : new Date(cart.closeDate);


    return `
      <div class="history-card">
        <div class="history-summary">
          <div class="history-title">
            <h3>${cart.cartonUid}</h3>
            <span class="status ${cart.financials.remaining === 0 ? 'complete' : 'partial'}">
              ${cart.financials.remaining === 0 ? '✅ Complete' : '⚠️ Partial'}
            </span>
          </div>

          <div class="history-dates">
            <span>Opened: ${openDate.toLocaleString()}</span>
            <span>Closed: ${closeDate.toLocaleString()}</span>
          </div>

          <div class="history-amounts">
            <span class="amount total">Total: Rs ${cart.financials.total}</span>
            <span class="amount received">Received: Rs ${cart.financials.received}</span>
            ${cart.financials.manualReceived
        ? `<span class="amount manual">Manual: Rs ${cart.financials.manualReceived}</span>`
        : ""
      }
            ${cart.financials.remaining > 0
        ? `<span class="amount remaining">Remaining: Rs ${cart.financials.remaining}</span>`
        : ""
      }
          </div>
        </div>

        <details class="history-details">
          <summary>View Entries</summary>
          ${cart.entries.map(e => `
            <div class="history-entry">
              <span>${e.name}</span>
              <span>${e.packets} Packets</span>
              ${e.amount == 0 ? `<span></span>` :
          `<span>Rs ${e.amount}</span>`

        }
              ${e.amount == 0 ? `<span>paid</span>` :
          `<span>partial paid</span>`
        }
            </div>
          `).join("")}
        </details>
      </div>
    `;

  }).join("");
}

function generateLedgerId() {
  return "L" + Date.now() + Math.floor(Math.random() * 1000);
}



load();
