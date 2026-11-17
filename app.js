const PLATFORMS = ["x", "instagram", "youtube", "tiktok"];

const PLATFORM_LABEL = {
  x: "X",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
};

const SERIES_LABEL = {
  "my-wife-is-a-mystery": "My Wife Is a Mystery",
  history: "History",
  office: "Office",
  other: "Other",
};

const PLATFORM_COLOR = {
  x: "#8eb4ff",
  instagram: "#ff8a2a",
  youtube: "#ff5d6c",
  tiktok: "#2ee6d6",
};

const state = {
  posts: [],
  sortKey: "views",
  sortDir: "desc",
  platform: "all",
  series: "all",
};

const charts = { followers: null, views: null };
let controlsBound = false;

function formatNumber(value) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatSigned(value) {
  const amount = formatNumber(Math.abs(value));
  if (value > 0) return `+${amount}`;
  if (value < 0) return `−${amount}`;
  return "0";
}

function formatPercent(rate) {
  return `${(rate * 100).toLocaleString("en-GB", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatLondon(iso, withTime) {
  const options = {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  if (withTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
    options.timeZoneName = "short";
  }
  return new Intl.DateTimeFormat("en-GB", options).format(new Date(iso));
}

function engagementRate(post) {
  if (!post.views) return null;
  return (post.likes + post.comments + post.shares) / post.views;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function externalLink(href, text) {
  const link = el("a", "post-link", text);
  if (typeof href === "string" && /^https?:\/\//i.test(href)) {
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  return link;
}

function pill(text) {
  return el("span", "pill", text);
}

function renderCards(platforms) {
  const root = document.getElementById("cards");
  root.replaceChildren();
  PLATFORMS.forEach((name) => {
    const block = platforms[name];
    if (!block) return;
    const card = el("article", "card");
    const top = el("div", "card-top");
    const dot = el("span", "dot");
    dot.style.setProperty("--swatch", PLATFORM_COLOR[name]);
    top.append(dot, el("h3", null, PLATFORM_LABEL[name]));

    const followers = el("p", "followers", formatNumber(block.followers));
    followers.append(el("span", null, "followers"));

    const direction = block.followers_change_7d > 0 ? "up" : block.followers_change_7d < 0 ? "down" : "flat";
    const change = el("p", `change ${direction}`, `${formatSigned(block.followers_change_7d)} in 7 days`);

    const views = el("p", "views-line", `${formatNumber(block.views_28d)} views`);
    views.append(el("span", null, " in 28 days"));

    card.append(top, followers, change, views);
    root.append(card);
  });
}

function renderBest(data) {
  const updated = new Date(data.updated_at);
  const start = new Date(updated.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windowLabel = document.getElementById("best-window");
  windowLabel.textContent = `Posts published from ${formatLondon(start.toISOString(), true)} to ${formatLondon(data.updated_at, true)}, ranked by engagement rate (likes + comments + shares, divided by views).`;

  const ranked = data.posts
    .filter((post) => {
      const published = new Date(post.published_at);
      return published >= start && published <= updated;
    })
    .sort((a, b) => {
      const rateA = engagementRate(a);
      const rateB = engagementRate(b);
      if (rateA == null && rateB == null) return b.views - a.views;
      if (rateA == null) return 1;
      if (rateB == null) return -1;
      if (rateB !== rateA) return rateB - rateA;
      return b.views - a.views;
    })
    .slice(0, 3);

  const list = document.getElementById("best-list");
  list.replaceChildren();
  if (!ranked.length) {
    list.append(el("li", "empty", "No posts were published in that window."));
    return;
  }

  ranked.forEach((post, index) => {
    const item = el("li", "best-card");
    const top = el("div", "best-top");
    top.append(el("span", "rank", String(index + 1)), pill(PLATFORM_LABEL[post.platform] || post.platform));
    const title = el("h3");
    title.append(externalLink(post.url, post.title));
    const pills = el("div", "pills");
    pills.append(pill(SERIES_LABEL[post.series] || post.series));
    const stats = el("div", "stat-row");
    const rate = engagementRate(post);
    const rateBox = el("div", null, rate == null ? "—" : formatPercent(rate));
    rateBox.prepend(el("span", null, "Engagement"));
    const viewBox = el("div", null, formatNumber(post.views));
    viewBox.prepend(el("span", null, "Views"));
    stats.append(rateBox, viewBox);
    item.append(top, title, pills, stats);
    list.append(item);
  });
}

function hexToRgba(hex, alpha) {
  const value = parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function renderCharts(history) {
  if (typeof Chart === "undefined") {
    document.getElementById("chart-error").hidden = false;
    return;
  }
  if (!history.length) {
    const note = document.getElementById("chart-error");
    note.hidden = false;
    note.classList.remove("error");
    note.textContent = "No history snapshots in stats.json yet.";
    return;
  }
  const dates = [...new Set(history.map((row) => row.date))].sort();
  // Noon UTC keeps the London calendar date on the snapshot date.
  const labels = dates.map((date) => formatLondon(`${date}T12:00:00Z`, false));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function datasets(field) {
    return PLATFORMS.map((platform) => {
      const byDate = new Map(
        history.filter((row) => row.platform === platform).map((row) => [row.date, row[field]])
      );
      return {
        label: PLATFORM_LABEL[platform],
        data: dates.map((date) => (byDate.has(date) ? byDate.get(date) : null)),
        borderColor: PLATFORM_COLOR[platform],
        backgroundColor: hexToRgba(PLATFORM_COLOR[platform], 0.16),
        pointRadius: 0,
        pointHitRadius: 10,
        borderWidth: 2,
        tension: 0.25,
        spanGaps: false,
      };
    });
  }

  function options(beginAtZero) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: reduceMotion ? false : { duration: 500 },
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#a9b6ce", boxWidth: 10, usePointStyle: true, padding: 16 },
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.parsed.y;
              return `${context.dataset.label}: ${value == null ? "—" : formatNumber(value)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#a9b6ce", maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          beginAtZero,
          ticks: {
            color: "#a9b6ce",
            callback: (value) => formatNumber(value),
          },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
      },
    };
  }

  charts.followers?.destroy();
  charts.views?.destroy();
  Chart.defaults.font.family = '"Nunito", "Segoe UI", sans-serif';
  charts.followers = new Chart(document.getElementById("followers-chart"), {
    type: "line",
    data: { labels, datasets: datasets("followers") },
    options: options(false),
  });
  charts.views = new Chart(document.getElementById("views-chart"), {
    type: "line",
    data: { labels, datasets: datasets("views") },
    options: options(true),
  });
}

function comparePosts(a, b) {
  const dir = state.sortDir === "asc" ? 1 : -1;
  const valueA = state.sortKey === "engagement" ? engagementRate(a) : a[state.sortKey];
  const valueB = state.sortKey === "engagement" ? engagementRate(b) : b[state.sortKey];
  if (valueA == null && valueB == null) return a.title.localeCompare(b.title);
  if (valueA == null) return 1;
  if (valueB == null) return -1;
  if (valueA !== valueB) return (valueA - valueB) * dir;
  return a.title.localeCompare(b.title);
}

function filteredPosts() {
  return state.posts.filter((post) => {
    if (state.platform !== "all" && post.platform !== state.platform) return false;
    if (state.series !== "all" && post.series !== state.series) return false;
    return true;
  });
}

function updateSortHeaders() {
  const sortMode = document.getElementById("sort-mode");
  sortMode.value = `${state.sortKey}-${state.sortDir}`;
  document.querySelectorAll(".sort-btn").forEach((button) => {
    const key = button.dataset.sort;
    const active = key === state.sortKey;
    const header = button.closest("th");
    header.setAttribute("aria-sort", active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none");
    const arrow = active ? (state.sortDir === "desc" ? " ↓" : " ↑") : "";
    button.textContent = `${button.dataset.label}${arrow}`;
  });
}

function renderTable() {
  updateSortHeaders();
  const rows = filteredPosts().sort(comparePosts);
  const count = document.getElementById("post-count");
  count.textContent = `${rows.length} of ${state.posts.length} posts. Engagement rate is likes + comments + shares, divided by views.`;
  const body = document.getElementById("post-rows");
  body.replaceChildren();
  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = el("td", "empty", "No posts match these filters.");
    cell.colSpan = 9;
    row.append(cell);
    body.append(row);
    return;
  }
  rows.forEach((post) => {
    const row = document.createElement("tr");
    const titleCell = document.createElement("td");
    titleCell.append(externalLink(post.url, post.title));
    const rate = engagementRate(post);
    const cells = [
      titleCell,
      el("td", null, PLATFORM_LABEL[post.platform] || post.platform),
      el("td", null, SERIES_LABEL[post.series] || post.series),
      el("td", null, formatLondon(post.published_at, false)),
      el("td", "num", formatNumber(post.views)),
      el("td", "num", formatNumber(post.likes)),
      el("td", "num", formatNumber(post.comments)),
      el("td", "num", formatNumber(post.shares)),
      el("td", "num", rate == null ? "—" : formatPercent(rate)),
    ];
    const published = cells[3];
    const time = document.createElement("time");
    time.dateTime = post.published_at;
    time.textContent = published.textContent;
    published.textContent = "";
    published.append(time);
    const labels = ["Post", "Platform", "Series", "Published", "Views", "Likes", "Comments", "Shares", "Engagement"];
    cells.forEach((cell, index) => {
      cell.dataset.label = labels[index];
    });
    row.append(...cells);
    body.append(row);
  });
}

function bindControls() {
  if (controlsBound) return;
  controlsBound = true;
  document.getElementById("filter-platform").addEventListener("change", (event) => {
    state.platform = event.target.value;
    renderTable();
  });
  document.getElementById("filter-series").addEventListener("change", (event) => {
    state.series = event.target.value;
    renderTable();
  });
  document.getElementById("sort-mode").addEventListener("change", (event) => {
    const [key, dir] = event.target.value.split("-");
    state.sortKey = key;
    state.sortDir = dir;
    renderTable();
  });
  document.querySelectorAll(".sort-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
      } else {
        state.sortKey = key;
        state.sortDir = "desc";
      }
      renderTable();
    });
  });
}

function showError(message) {
  const status = document.getElementById("status");
  status.hidden = false;
  status.classList.add("error");
  status.textContent = message;
  document.body.dataset.ready = "error";
}

function render(data) {
  document.getElementById("example-banner").hidden = data.example !== true;
  const updated = document.getElementById("updated-at");
  updated.dateTime = data.updated_at;
  updated.textContent = formatLondon(data.updated_at, true);
  renderCards(data.platforms || {});
  renderBest(data);
  renderCharts(Array.isArray(data.history) ? data.history : []);
  state.posts = Array.isArray(data.posts) ? data.posts : [];
  bindControls();
  renderTable();
  const status = document.getElementById("status");
  status.textContent = "";
  status.hidden = true;
  document.body.dataset.ready = "true";
}

async function main() {
  try {
    const response = await fetch("data/stats.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load data/stats.json (${response.status}).`);
    }
    const data = await response.json();
    if (!data || typeof data !== "object" || !data.platforms || !Array.isArray(data.posts)) {
      throw new Error("stats.json does not match the expected shape. Run python3 scripts/validate_stats.py.");
    }
    render(data);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not load stats.");
  }
}

main();
