// ===============================
// 🔥 Firebase v12 Modular Setup
// ===============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Firebase Config (YOURS)
const firebaseConfig = {
    apiKey: "AIzaSyCtgE80bKwp3ZqeKFzhoBX_cpzw1MZHzV0",
    authDomain: "cartons-management.firebaseapp.com",
    projectId: "cartons-management",
    storageBucket: "cartons-management.firebasestorage.app",
    messagingSenderId: "153740832676",
    appId: "1:153740832676:web:10da33b94a1077476e9b31",
    measurementId: "G-LS0KFJSTZX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Firestore reference
const ref = doc(db, "carton", "data");

// ===============================
// App State
// ===============================
let state = {
    lifetimeCartons: 0,
    lifetimeRevenue: 0,
    total: 0,
    received: 0,
    entries: []
};

// ===============================
// UI Render
// ===============================
function render() {
    document.getElementById("lifeCartons").innerText = state.lifetimeCartons;
    document.getElementById("lifeRevenue").innerText = state.lifetimeRevenue;
    document.getElementById("total").innerText = state.total;
    document.getElementById("received").innerText = state.received;
    document.getElementById("remaining").innerText =
        state.total - state.received;

    // Enable close only if carton exists
    document.getElementById("closeBtn").disabled = state.total === 0;

    const entriesDiv = document.getElementById("entries");
    entriesDiv.innerHTML = "";

    state.entries.forEach((e, i) => {
        entriesDiv.innerHTML += `
      <div class="entry">
        <input value="${e.name}" disabled />
        <input value="${e.packets}" disabled />
        <input value="${e.amount}" disabled />
        <button onclick="pay(${i})">Paid</button>
      </div>
    `;
    });
}

// ===============================
// Actions (EXPOSE TO HTML)
// ===============================
window.openPopup = function () {
    document.getElementById("popup").style.display = "flex";
};

window.saveCarton = function () {
    const packets = Number(document.getElementById("packetCount").value);
    if (!packets) return alert("Enter packet count");

    state.total = packets * 2500;
    document.getElementById("popup").style.display = "none";
    save();
};

window.addEntry = function () {
    const name = prompt("Customer Name");
    if (!name) return;

    const packets = Number(prompt("Number of Packets"));
    if (!packets) return;

    const autoAmount = packets * 2500;
    const amount = Number(prompt("Amount", autoAmount));

    state.entries.push({ name, packets, amount });
    save();
};

window.pay = function (index) {
    state.received += state.entries[index].amount;
    state.entries.splice(index, 1);
    save();
};

window.manualReceive = function () {
    const amt = Number(document.getElementById("manualAmount").value);
    if (!amt) return;

    state.received += amt;
    document.getElementById("manualAmount").value = "";
    save();
};

window.closeCarton = function () {
    if (state.total === 0) {
        alert("No active carton to close.");
        return;
    }

    const ok = confirm(
        "Close this carton?\nRemaining amount will be ignored."
    );
    if (!ok) return;

    state.lifetimeCartons += 1;
    state.lifetimeRevenue += state.received;

    state.total = 0;
    state.received = 0;
    state.entries = [];

    save();
};

window.showLoading = function () {
    document.getElementById("loading").style.display = "flex";
}

window.hideLoading = function () {
    document.getElementById("loading").style.display = "none";
}

// ===============================
// Firestore Save / Load
// ===============================
async function save() {
    showLoading();
    try {
        await setDoc(ref, state);
    } catch (err) {
        console.error("Error saving:", err);
    }
    hideLoading();
    render();
}

async function load() {
    showLoading();
    try {
        const snap = await getDoc(ref);
        if (snap.exists()) {
            state = snap.data();
        }
    } catch (err) {
        console.error("Error loading:", err);
    }
    hideLoading();
    render();
}

load();