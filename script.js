import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
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
  entries: []
};

const loading = document.getElementById("loading");
const showLoading = () => loading.style.display = "flex";
const hideLoading = () => loading.style.display = "none";

function render() {
  document.getElementById("lifeCartons").innerText = state.lifetimeCartons;
  document.getElementById("lifeRevenue").innerText = state.lifetimeRevenue;
  document.getElementById("total").innerText = state.total;
  document.getElementById("received").innerText = state.received;
  document.getElementById("remaining").innerText = state.total - state.received;
  document.getElementById("closeBtn").disabled = state.total === 0;

  const entries = document.getElementById("entries");
  entries.innerHTML = "";

  state.entries.forEach((e, i) => {
    entries.innerHTML += `
      <div class="entry">
        <input value="${e.name}" disabled>
        <input value="${e.packets}" disabled>
        <input value="${e.amount}" disabled>
        <button onclick="editEntry(${i})">Edit</button>
        <button onclick="pay(${i})">Paid</button>
      </div>`;
  });
}

async function load() {
  showLoading();
  const snap = await getDoc(ref);
  if (snap.exists()) state = snap.data();
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

window.saveEntry = () => {
  const name = entryName.value;
  const packets = Number(entryPackets.value);
  const amount = Number(entryAmount.value || packets * 2500);
  if (!name || !packets) return alert("Fill all fields");

  const entry = { name, packets, amount };
  editingIndex === null
    ? state.entries.push(entry)
    : state.entries[editingIndex] = entry;

  document.getElementById("entryPopup").style.display = "none";
  save();
};

window.pay = i => {
  state.received += state.entries[i].amount;
  state.entries.splice(i, 1);
  save();
};

window.manualReceive = () => {
  const amt = Number(manualAmount.value);
  if (!amt) return;
  state.received += amt;
  manualAmount.value = "";
  save();
};

window.closeCarton = () => {
  if (!confirm("Close carton?")) return;
  state.lifetimeCartons++;
  state.lifetimeRevenue += state.received;
  state.total = 0;
  state.received = 0;
  state.entries = [];
  save();
};

entryPackets.addEventListener("input", e => {
  entryAmount.value = e.target.value * 2500;
});

load();
