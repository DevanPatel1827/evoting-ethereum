// frontend/js/app.js

let provider = null;
let signer = null;
let factoryContract = null;

async function connectWallet() {
  try {
    if (!window.ethereum) {
      alert("MetaMask not detected. Please install MetaMask first.");
      return;
    }

    // ethers v5 style:
    provider = new ethers.providers.Web3Provider(window.ethereum);
    // Request accounts from MetaMask
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();

    // Build factory contract instance using signer
    factoryContract = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);

    const connectBtn = document.getElementById("connectBtn");
    if (connectBtn) {
      const addr = await signer.getAddress();
      connectBtn.innerText = addr.slice(0, 6) + "..." + addr.slice(-4);
      connectBtn.disabled = true;
    }

    // After wallet connect, init page-specific logic
    await initIndexPage();
    await initAdminPage();
    await initVotePage();
  } catch (err) {
    console.error("connectWallet error:", err);
    alert("Failed to connect wallet. Check console for details.");
  }
}

function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

// ---------------- INDEX PAGE ----------------
async function initIndexPage() {
  if (!document.getElementById("createElectionForm")) return;
  if (!factoryContract) return;

  // Load existing elections
  await loadElections();

  // Hook form submit
  const form = document.getElementById("createElectionForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const title = document.getElementById("titleInput").value.trim();
      const desc = document.getElementById("descriptionInput").value.trim();
      const regDur = parseInt(document.getElementById("regDurationInput").value || "0", 10);
      const votDur = parseInt(document.getElementById("votDurationInput").value || "0", 10);

      if (!title || !desc || regDur <= 0 || votDur <= 0) {
        alert("Please fill all fields with valid values.");
        return;
      }

      const tx = await factoryContract.createElection(title, desc, regDur, votDur);
      await tx.wait();
      alert("Election created on-chain!");

      await loadElections();
      form.reset();
    } catch (err) {
      console.error("createElection error:", err);
      alert("Failed to create election. See console.");
    }
  });
}

async function loadElections() {
  const container = document.getElementById("electionsList");
  if (!container || !factoryContract) return;

  container.innerHTML = "<p>Loading elections...</p>";

  try {
    const count = await factoryContract.electionCount();
    const num = Number(count);
    if (num === 0) {
      container.innerHTML = "<p>No elections yet.</p>";
      return;
    }

    container.innerHTML = "";
    for (let i = 1; i <= num; i++) {
      const addr = await factoryContract.elections(i);
      const electionContract = new ethers.Contract(addr, ELECTION_ABI, provider);
      const title = await electionContract.title();

      const col = document.createElement("div");
      col.className = "col-md-4 mb-3";
      col.innerHTML = `
        <div class="card shadow-sm h-100">
          <div class="card-body d-flex flex-column">
            <h5 class="card-title">${title}</h5>
            <p class="card-text small text-muted">${addr}</p>
            <div class="mt-auto d-flex justify-content-between">
              <a href="admin.html?addr=${addr}" class="btn btn-primary btn-sm">Admin Panel</a>
              <a href="vote.html?addr=${addr}" class="btn btn-outline-secondary btn-sm">Vote / Results</a>
            </div>
          </div>
        </div>
      `;
      container.appendChild(col);
    }
  } catch (err) {
    console.error("loadElections error:", err);
    container.innerHTML = "<p>Error loading elections. See console.</p>";
  }
}

// ---------------- ADMIN PAGE ----------------
async function initAdminPage() {
  const adminRoot = document.getElementById("adminPage");
  if (!adminRoot) return;

  const addr = getQueryParam("addr");
  if (!addr) {
    adminRoot.innerHTML = "<p>No election address provided in URL.</p>";
    return;
  }

  if (!provider) {
    // wait for connection
    return;
  }

  const election = new ethers.Contract(addr, ELECTION_ABI, signer || provider);

  // Display basic info
  document.getElementById("electionAddress").innerText = addr;

  await refreshAdminView(election);

  // Add candidate
  const addCandidateForm = document.getElementById("addCandidateForm");
  addCandidateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const name = document.getElementById("candidateNameInput").value.trim();
      if (!name) {
        alert("Candidate name cannot be empty.");
        return;
      }
      const tx = await election.addCandidate(name);
      await tx.wait();
      alert("Candidate added.");
      document.getElementById("candidateNameInput").value = "";
      await refreshAdminView(election);
    } catch (err) {
      console.error("addCandidate error:", err);
      alert("Failed to add candidate. Maybe wrong phase or not admin.");
    }
  });

  document.getElementById("startRegistrationBtn").addEventListener("click", async () => {
    try {
      const tx = await election.startRegistration();
      await tx.wait();
      alert("Registration started.");
      await refreshAdminView(election);
    } catch (err) {
      console.error("startRegistration error:", err);
      alert("Failed to start registration.");
    }
  });

  document.getElementById("startVotingBtn").addEventListener("click", async () => {
    try {
      const tx = await election.startVoting();
      await tx.wait();
      alert("Voting started.");
      await refreshAdminView(election);
    } catch (err) {
      console.error("startVoting error:", err);
      alert("Failed to start voting.");
    }
  });

  document.getElementById("endElectionBtn").addEventListener("click", async () => {
    try {
      const tx = await election.endElection();
      await tx.wait();
      alert("Election ended.");
      await refreshAdminView(election);
    } catch (err) {
      console.error("endElection error:", err);
      alert("Failed to end election.");
    }
  });
}

async function refreshAdminView(election) {
  try {
    const title = await election.title();
    const desc = await election.description();
    const phase = await election.getPhase();
    const candidates = await election.getAllCandidates();

    document.getElementById("electionTitle").innerText = title;
    document.getElementById("electionDescription").innerText = desc;
    document.getElementById("phaseBadge").innerText = phaseName(Number(phase));

    const list = document.getElementById("candidatesList");
    list.innerHTML = "";
    candidates.forEach((c) => {
      const li = document.createElement("li");
      li.className = "list-group-item d-flex justify-content-between align-items-center";
      li.innerHTML = `
        <span>${c.name}</span>
        <span class="badge bg-primary rounded-pill">${c.voteCount}</span>
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error("refreshAdminView error:", err);
  }
}

// ---------------- VOTE PAGE ----------------
async function initVotePage() {
  const voteRoot = document.getElementById("votePage");
  if (!voteRoot) return;

  const addr = getQueryParam("addr");
  if (!addr) {
    voteRoot.innerHTML = "<p>No election address provided in URL.</p>";
    return;
  }

  if (!provider) {
    return;
  }

  const election = new ethers.Contract(addr, ELECTION_ABI, signer || provider);

  document.getElementById("voteElectionAddress").innerText = addr;

  await refreshVoteView(election);

  document.getElementById("registerVoterBtn").addEventListener("click", async () => {
    try {
      const tx = await election.registerVoter();
      await tx.wait();
      alert("You are now registered as a voter for this election.");
    } catch (err) {
      console.error("registerVoter error:", err);
      alert("Failed to register. Check phase / you might already be registered.");
    }
  });

  const voteForm = document.getElementById("voteForm");
  voteForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const select = document.getElementById("candidateSelect");
      const candidateId = Number(select.value);
      if (!candidateId) {
        alert("Please select a candidate.");
        return;
      }
      const tx = await election.vote(candidateId);
      await tx.wait();
      alert("Vote cast successfully!");
      await refreshVoteView(election);
    } catch (err) {
      console.error("vote error:", err);
      alert("Failed to vote. Check if registered, phase, or already voted.");
    }
  });
}

async function refreshVoteView(election) {
  try {
    const title = await election.title();
    const desc = await election.description();
    const phase = await election.getPhase();
    const candidates = await election.getAllCandidates();

    document.getElementById("voteElectionTitle").innerText = title;
    document.getElementById("voteElectionDescription").innerText = desc;
    document.getElementById("votePhaseBadge").innerText = phaseName(Number(phase));

    const select = document.getElementById("candidateSelect");
    const results = document.getElementById("resultsList");
    select.innerHTML = "";
    results.innerHTML = "";

    candidates.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.id} – ${c.name}`;
      select.appendChild(opt);

      const li = document.createElement("li");
      li.className = "list-group-item d-flex justify-content-between align-items-center";
      li.innerHTML = `
        <span>${c.id}. ${c.name}</span>
        <span class="badge bg-primary rounded-pill">${c.voteCount}</span>
      `;
      results.appendChild(li);
    });
  } catch (err) {
    console.error("refreshVoteView error:", err);
  }
}

// ---------------- Helpers ----------------
function phaseName(p) {
  switch (p) {
    case 0: return "Created";
    case 1: return "Registration";
    case 2: return "Voting";
    case 3: return "Ended";
    default: return "Unknown";
  }
}

// ---------------- Auto-wiring ----------------
document.addEventListener("DOMContentLoaded", () => {
  const connectBtn = document.getElementById("connectBtn");
  if (connectBtn) {
    connectBtn.addEventListener("click", connectWallet);
  }
});
