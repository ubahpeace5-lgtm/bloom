const STORAGE_KEY = "bloom_tasks";
const THEME_KEY = "bloom_theme";
const USERNAME_KEY = "bloom_user_name";
const NOTIFIED_KEY = "bloom_notified_reminders";


/* =========================
   APP STATE
========================= */

let tasks = [];

try {

  tasks = JSON.parse(
    localStorage.getItem(STORAGE_KEY) || "[]"
  );

  if (!Array.isArray(tasks)) {
    tasks = [];
  }

} catch (error) {

  console.error(
    "Could not load Bloom tasks:",
    error
  );

  tasks = [];

}


let currentView = "dashboard";
let searchTerm = "";

let audioContext = null;
let alarmInterval = null;

let notifiedReminders = [];

try {

  notifiedReminders = JSON.parse(
    localStorage.getItem(NOTIFIED_KEY) || "[]"
  );

  if (!Array.isArray(notifiedReminders)) {
    notifiedReminders = [];
  }

} catch (error) {

  notifiedReminders = [];

}


/* =========================
   VIEW CONFIG
========================= */

const VIEW_CONFIG = {

  dashboard: {
    title: "Dashboard",
    description:
      "Here's what's on your plate today."
  },

  all: {
    title: "My Tasks",
    description:
      "All your tasks in one place."
  },

  today: {
    title: "Today",
    description:
      "Tasks that are due today."
  },

  upcoming: {
    title: "Upcoming",
    description:
      "Stay ahead of what's coming next."
  },

  completed: {
    title: "Completed",
    description:
      "A record of everything you've finished."
  },

  school: {
    title: "School Work",
    description:
      "Keep your academic tasks organized."
  },

  work: {
    title: "Work",
    description:
      "Your work-related tasks."
  },

  personal: {
    title: "Personal",
    description:
      "Personal tasks and plans."
  },

  errands: {
    title: "Errands",
    description:
      "Things you need to get done."
  },

  settings: {
    title: "Settings",
    description:
      "Customize your Bloom experience."
  }

};


/* =========================
   STORAGE
========================= */

function saveTasks() {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(tasks)
  );

}


function saveNotifiedReminders() {

  localStorage.setItem(
    NOTIFIED_KEY,
    JSON.stringify(notifiedReminders)
  );

}


/* =========================
   USERNAME
========================= */

function getUserName() {

  return (
    localStorage.getItem(
      USERNAME_KEY
    ) || "User"
  );

}


function saveUserName(name) {

  const cleanName =
    name.trim();

  if (!cleanName) {
    return false;
  }

  localStorage.setItem(
    USERNAME_KEY,
    cleanName
  );

  return true;

}


/* =========================
   DATE HELPERS
========================= */

function localDateString(
  date = new Date()
) {

  const y =
    date.getFullYear();

  const m =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const d =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${y}-${m}-${d}`;

}


function normalizeReminderTime(value) {

  if (!value || typeof value !== "string") {
    return "";
  }

  const raw = value.trim();

  if (!raw) {
    return "";
  }

  const sanitized = raw.replace(/[^0-9:]/g, "");

  if (!sanitized) {
    return "";
  }

  const parts = sanitized.split(":");

  if (parts.length === 1) {
    return "";
  }

  let hours = String(
    Number.parseInt(parts[0], 10) || 0
  );

  let minutes = String(
    Number.parseInt(parts[1], 10) || 0
  );

  let seconds = "00";

  if (parts.length >= 3) {
    seconds = String(
      Number.parseInt(parts[2], 10) || 0
    );
  }

  hours = String(
    Math.min(Number.parseInt(hours, 10), 23)
  ).padStart(2, "0");

  minutes = String(
    Math.min(Number.parseInt(minutes, 10), 59)
  ).padStart(2, "0");

  seconds = String(
    Math.min(Number.parseInt(seconds, 10), 59)
  ).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;

}


function formatReminderTime(value) {

  const cleaned = normalizeReminderTime(value);

  if (!cleaned) {
    return "";
  }

  return cleaned.endsWith(":00")
    ? cleaned.slice(0, -3)
    : cleaned;

}


function formatDate(value) {

  if (!value) {
    return "No due date";
  }

  const date =
    new Date(
      `${value}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return value;

  }

  return date.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric"
    }
  );

}


/* =========================
   HTML SAFETY
========================= */

function escapeHtml(value) {

  const div =
    document.createElement("div");

  div.textContent =
    value ?? "";

  return div.innerHTML;

}


/* =========================
   MODAL
========================= */

function openModal() {

  const modal =
    document.getElementById(
      "taskModal"
    );

  if (!modal) {
    return;
  }

  modal.classList.add(
    "show"
  );

  requestNotificationPermission();

  initializeAlarmAudio();


  setTimeout(() => {

    document
      .getElementById(
        "taskTitle"
      )
      ?.focus();

  }, 50);

}


function closeModal() {

  document
    .getElementById(
      "taskModal"
    )
    ?.classList.remove(
      "show"
    );

}


/* =========================
   NAVIGATION
========================= */

function getViewFromHash() {

  const hash =
    window.location.hash.replace(
      /^#/,
      ""
    );

  return Object.hasOwn(
    VIEW_CONFIG,
    hash
  )
    ? hash
    : "dashboard";

}


function navigate(
  view,
  push = true
) {

  if (
    !Object.hasOwn(
      VIEW_CONFIG,
      view
    )
  ) {

    view = "dashboard";

  }


  currentView = view;


  if (push) {

    history.pushState(
      {},
      "",
      `#${view}`
    );

  }


  renderApp();

}


/* =========================
   SEARCH
========================= */

function matchesSearch(task) {

  if (!searchTerm) {
    return true;
  }


  const searchableText = [

    task.title,
    task.description,
    task.category,
    task.priority,
    task.dueDate,
    task.reminder

  ]

    .filter(Boolean)

    .join(" ")

    .toLowerCase();


  return searchableText.includes(
    searchTerm
  );

}


/* =========================
   TASK FILTERING
========================= */

function getFilteredTasks(
  view = currentView
) {

  const today =
    localDateString();

  let result =
    [...tasks];


  switch (view) {

    case "today":

      result =
        result.filter(
          task =>
            task.dueDate === today &&
            !task.completed
        );

      break;


    case "upcoming":

      result =
        result.filter(
          task =>
            task.dueDate &&
            task.dueDate > today &&
            !task.completed
        );

      break;


    case "completed":

      result =
        result.filter(
          task =>
            task.completed
        );

      break;


    case "school":
    case "work":
    case "personal":
    case "errands":

      result =
        result.filter(
          task =>
            String(
              task.category || ""
            ).toLowerCase() === view
        );

      break;


    case "all":
    case "dashboard":
    case "settings":
    default:

      break;

  }


  return result.filter(
    matchesSearch
  );

}


/* =========================
   TASK CARD
========================= */

function taskMarkup(task) {

  return `

    <article
      class="task-card ${
        task.completed
          ? "completed"
          : ""
      }"
      data-id="${escapeHtml(task.id)}"
    >


      <button
        class="task-checkbox ${
          task.completed
            ? "completed"
            : ""
        }"
        type="button"
        aria-label="${
          task.completed
            ? "Mark incomplete"
            : "Complete task"
        }"
      ></button>


      <div class="task-info">


        <div class="task-title">

          ${escapeHtml(
            task.title
          )}

        </div>


        <div class="task-meta">


          <span>
            ${escapeHtml(
              task.category ||
              "personal"
            )}
          </span>


          <span>
            •
          </span>


          <span>
            ${escapeHtml(
              formatDate(
                task.dueDate
              )
            )}
          </span>


          ${
            task.reminder

              ? `

                <span>
                  •
                </span>

                <span>
                  🔔
                  ${escapeHtml(
                    task.reminder
                  )}
                </span>

              `

              : ""
          }


          <span>
            •
          </span>


          <span>
            ${escapeHtml(
              task.priority ||
              "medium"
            )}
            priority
          </span>


        </div>


        ${
          task.description

            ? `

              <p class="task-description">
                ${escapeHtml(
                  task.description
                )}
              </p>

            `

            : ""
        }


      </div>


      <div class="task-actions">

        <button
          class="delete-task"
          type="button"
          aria-label="Delete task"
          title="Delete task"
        >
          🗑
        </button>

      </div>


    </article>

  `;

}


/* =========================
   TASK LIST
========================= */

function listMarkup(view) {

  const visible =
    getFilteredTasks(view);


  if (!visible.length) {

    let message =
      "Your day is waiting to bloom. Add a task to get started.";


    if (searchTerm) {

      message =
        `No tasks match "${escapeHtml(
          searchTerm
        )}".`;

    }


    else if (
      view === "completed"
    ) {

      message =
        "Completed tasks will appear here.";

    }


    else if (
      view === "upcoming"
    ) {

      message =
        "You don't have any upcoming tasks yet.";

    }


    else if (
      view === "today"
    ) {

      message =
        "You don't have any tasks due today.";

    }


    else if (
      [
        "school",
        "work",
        "personal",
        "errands"
      ].includes(view)
    ) {

      message =
        "There are no tasks in this category yet.";

    }


    return `

      <div class="empty-state">

        <div class="empty-icon">
          ✦
        </div>


        <h3>

          ${
            searchTerm
              ? "No results found"
              : "No tasks found"
          }

        </h3>


        <p>
          ${message}
        </p>


        ${
          searchTerm

            ? `

              <button
                class="empty-add-btn"
                id="clearSearch"
                type="button"
              >
                Clear search
              </button>

            `

            : `

              <button
                class="empty-add-btn"
                type="button"
              >
                ＋ Add task
              </button>

            `
        }


      </div>

    `;

  }


  return `

    <div class="task-list">

      ${visible
        .map(taskMarkup)
        .join("")}

    </div>

  `;

}


/* =========================
   DASHBOARD
========================= */

function dashboardMarkup() {

  const today =
    localDateString();


  const userName =
    getUserName();


  const completedCount =
    tasks.filter(
      task =>
        task.completed
    ).length;


  const pendingCount =
    tasks.filter(
      task =>
        !task.completed
    ).length;


  const todayCount =
    tasks.filter(
      task =>
        task.dueDate === today &&
        !task.completed
    ).length;


  const percentage =
    tasks.length

      ? Math.round(
          (
            completedCount /
            tasks.length
          ) * 100
        )

      : 0;


  const hour =
    new Date().getHours();


  const greeting =
    hour < 12

      ? "morning"

      : hour < 18

        ? "afternoon"

        : "evening";


  const todayTasks =
    tasks.filter(
      task =>
        task.dueDate === today &&
        !task.completed
    );


  return `

    <div class="welcome-section">


      <div>

        <p
          class="date"
          id="currentDate"
        ></p>


        <h1>

          Good ${greeting},
          ${escapeHtml(
            userName
          )}
          👋

        </h1>


        <p class="welcome-text">

          Here's what's on your plate today.

        </p>

      </div>


      <button
        class="add-task-btn"
        type="button"
      >

        <span>
          +
        </span>

        Add Task

      </button>


    </div>


    <section class="stats-grid">


      <div
        class="stat-card"
        data-stat-view="all"
        title="View all tasks"
      >

        <div class="stat-icon">
          📋
        </div>


        <div>

          <p>
            Total Tasks
          </p>


          <h2>
            ${tasks.length}
          </h2>

        </div>

      </div>


      <div
        class="stat-card"
        data-stat-view="completed"
        title="View completed tasks"
      >

        <div class="stat-icon">
          ✓
        </div>


        <div>

          <p>
            Completed
          </p>


          <h2>
            ${completedCount}
          </h2>

        </div>

      </div>


      <div
        class="stat-card"
        data-stat-view="today"
        title="View today's tasks"
      >

        <div class="stat-icon">
          ◷
        </div>


        <div>

          <p>
            Today's Tasks
          </p>


          <h2>
            ${todayCount}
          </h2>

        </div>

      </div>


    </section>


    <section class="progress-section">


      <div class="section-heading">


        <div>

          <h2>
            Overall Progress
          </h2>


          <p>

            ${completedCount}
            of
            ${tasks.length}
            task${
              tasks.length === 1
                ? ""
                : "s"
            }
            completed

          </p>

        </div>


        <strong>
          ${percentage}%
        </strong>


      </div>


      <div class="progress-bar">

        <div
          class="progress-fill"
          style="width:${percentage}%"
        ></div>

      </div>


    </section>


    <section class="tasks-section">


      <div class="section-heading">


        <div>

          <h2>
            Today's Tasks
          </h2>


          <p>

            ${todayTasks.length}
            task${
              todayTasks.length === 1
                ? ""
                : "s"
            }

          </p>

        </div>


        <button
          class="view-all-btn"
          id="viewAllTasks"
          type="button"
        >
          View all →
        </button>


      </div>


      ${
        todayTasks.length

          ? `

            <div class="task-list">

              ${todayTasks
                .map(taskMarkup)
                .join("")}

            </div>

          `

          : `

            <div class="empty-state">

              <div class="empty-icon">
                ✦
              </div>


              <h3>
                No tasks for today
              </h3>


              <p>
                Add a task with today's date
                and it will appear here.
              </p>


              <button
                class="empty-add-btn"
                type="button"
              >
                ＋ Add task
              </button>

            </div>

          `
      }


    </section>

  `;

}


/* =========================
   SETTINGS
========================= */

function settingsMarkup() {

  const userName =
    getUserName();


  const isDark =
    document.body.classList.contains(
      "dark-mode"
    );


  return `

    <section class="settings-panel">


      <!-- USERNAME -->

      <div class="settings-card">


        <div>

          <h2>
            Your name
          </h2>


          <p>
            This name will appear throughout
            your Bloom dashboard.
          </p>

        </div>


        <div class="name-setting">


          <input
            type="text"
            id="userNameInput"
            placeholder="Enter your name"
            value="${
              userName === "User"
                ? ""
                : escapeHtml(
                    userName
                  )
            }"
          >


          <button
            class="secondary-btn"
            id="saveUserName"
            type="button"
          >
            Save
          </button>


        </div>


      </div>


      <!-- APPEARANCE -->

      <div class="settings-card">


        <div>

          <h2>
            Appearance
          </h2>


          <p>
            Switch between light and dark mode.
          </p>

        </div>


        <button
          class="secondary-btn"
          id="settingsThemeToggle"
          type="button"
        >

          ${
            isDark
              ? "☀ Light mode"
              : "☾ Dark mode"
          }

        </button>


      </div>


      <!-- TASK PREFERENCES -->

      <div class="settings-card">


        <div>

          <h2>
            Task preferences
          </h2>


          <p>
            New tasks are saved automatically
            in your browser.
          </p>

        </div>


        <button
          class="secondary-btn"
          id="clearCompleted"
          type="button"
        >
          Clear completed
        </button>


      </div>


      <!-- STORAGE -->

      <div class="settings-card">


        <div>

          <h2>
            Storage
          </h2>


          <p>

            ${tasks.length}
            task${
              tasks.length === 1
                ? ""
                : "s"
            }
            currently stored locally.

          </p>

        </div>


        <button
          class="secondary-btn danger-btn"
          id="clearAllTasks"
          type="button"
        >
          Delete all tasks
        </button>


      </div>


    </section>

  `;

}


/* =========================
   UPDATE USER INTERFACE
========================= */

function updateUserInterface() {

  const userName =
    getUserName();


  const firstLetter =
    userName
      .charAt(0)
      .toUpperCase() ||
    "U";


  const sidebarName =
    document.getElementById(
      "sidebarUserName"
    );


  const topName =
    document.getElementById(
      "topUserName"
    );


  const sidebarAvatar =
    document.getElementById(
      "sidebarProfileAvatar"
    );


  const topAvatar =
    document.getElementById(
      "topProfileAvatar"
    );


  if (sidebarName) {

    sidebarName.textContent =
      userName;

  }


  if (topName) {

    topName.textContent =
      userName;

  }


  if (sidebarAvatar) {

    sidebarAvatar.textContent =
      firstLetter;

  }


  if (topAvatar) {

    topAvatar.textContent =
      firstLetter;

  }

}


/* =========================
   RENDER APP
========================= */

function renderApp() {

  const app =
    document.getElementById(
      "appView"
    );


  if (!app) {
    return;
  }


  const cfg =
    VIEW_CONFIG[currentView];


  const oldSearch =
    document.querySelector(
      ".search-box input"
    );


  const previousSearch =
    oldSearch
      ? oldSearch.value
      : searchTerm;


  /* DASHBOARD */

  if (
    currentView ===
    "dashboard"
  ) {

    app.innerHTML =
      dashboardMarkup();


    const dateElement =
      document.getElementById(
        "currentDate"
      );


    if (dateElement) {

      dateElement.textContent =
        new Date().toLocaleDateString(
          undefined,
          {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
          }
        );

    }

  }


  /* SETTINGS */

  else if (
    currentView ===
    "settings"
  ) {

    app.innerHTML = `

      <div class="page-header">


        <div>

          <p class="date">

            ${new Date().toLocaleDateString(
              undefined,
              {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"
              }
            )}

          </p>


          <h1>
            ${cfg.title}
          </h1>


          <p class="welcome-text">
            ${cfg.description}
          </p>

        </div>


        <button
          class="add-task-btn"
          type="button"
        >

          <span>
            +
          </span>

          Add Task

        </button>


      </div>


      ${settingsMarkup()}

    `;

  }


  /* TASK PAGES */

  else {

    const visible =
      getFilteredTasks(
        currentView
      );


    app.innerHTML = `

      <div class="page-header">


        <div>

          <p class="date">

            ${new Date().toLocaleDateString(
              undefined,
              {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"
              }
            )}

          </p>


          <h1>
            ${cfg.title}
          </h1>


          <p class="welcome-text">
            ${cfg.description}
          </p>

        </div>


        <button
          class="add-task-btn"
          type="button"
        >

          <span>
            +
          </span>

          Add Task

        </button>


      </div>


      <section class="tasks-section">


        <div class="section-heading">


          <div>

            <h2>
              ${cfg.title}
            </h2>


            <p>

              ${visible.length}
              task${
                visible.length === 1
                  ? ""
                  : "s"
              }

            </p>

          </div>


        </div>


        ${listMarkup(
          currentView
        )}


      </section>

    `;

  }


  /* RESTORE SEARCH */

  const newSearch =
    document.querySelector(
      ".search-box input"
    );


  if (newSearch) {

    newSearch.value =
      previousSearch || "";

  }


  updateThemeButton();

  updateUserInterface();

}


/* =========================
   THEME
========================= */

function updateThemeButton() {

  const isDark =
    document.body.classList.contains(
      "dark-mode"
    );


  const icon =
    document.getElementById(
      "themeIcon"
    );


  const text =
    document.getElementById(
      "themeText"
    );


  if (icon) {

    icon.textContent =
      isDark
        ? "☀"
        : "☾";

  }


  if (text) {

    text.textContent =
      isDark
        ? "Light"
        : "Dark";

  }

}


function applyTheme(theme) {

  const isDark =
    theme === "dark";


  document.body.classList.toggle(
    "dark-mode",
    isDark
  );


  localStorage.setItem(
    THEME_KEY,
    isDark
      ? "dark"
      : "light"
  );


  updateThemeButton();

}


function toggleTheme() {

  const isDark =
    document.body.classList.contains(
      "dark-mode"
    );


  applyTheme(
    isDark
      ? "light"
      : "dark"
  );


  if (
    currentView ===
    "settings"
  ) {

    renderApp();

  }

}


/* =========================
   NOTIFICATIONS
========================= */

async function requestNotificationPermission() {

  if (
    !("Notification" in window)
  ) {

    return;

  }


  if (
    Notification.permission ===
    "default"
  ) {

    try {

      await Notification.requestPermission();

    } catch (error) {

      console.error(
        "Notification permission error:",
        error
      );

    }

  }

}


/* =========================
   AUDIO
========================= */

function initializeAlarmAudio() {

  try {

    if (!audioContext) {

      audioContext =
        new (
          window.AudioContext ||
          window.webkitAudioContext
        )();

    }


    if (
      audioContext.state ===
      "suspended"
    ) {

      audioContext.resume();

    }

  } catch (error) {

    console.error(
      "Could not initialize alarm audio:",
      error
    );

  }

}


function playAlarmBeep() {

  try {

    initializeAlarmAudio();


    if (!audioContext) {
      return;
    }


    const oscillator =
      audioContext.createOscillator();


    const gain =
      audioContext.createGain();


    oscillator.type =
      "sine";


    oscillator.frequency.setValueAtTime(
      880,
      audioContext.currentTime
    );


    oscillator.frequency.exponentialRampToValueAtTime(
      660,
      audioContext.currentTime + 0.25
    );


    gain.gain.setValueAtTime(
      0.0001,
      audioContext.currentTime
    );


    gain.gain.exponentialRampToValueAtTime(
      0.3,
      audioContext.currentTime + 0.03
    );


    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + 0.4
    );


    oscillator.connect(gain);

    gain.connect(
      audioContext.destination
    );


    oscillator.start();


    oscillator.stop(
      audioContext.currentTime + 0.45
    );

  } catch (error) {

    console.error(
      "Alarm sound failed:",
      error
    );

  }

}


/* =========================
   START ALARM
========================= */

function startAlarm(task) {

  stopAlarm();


  playAlarmBeep();


  alarmInterval =
    setInterval(
      playAlarmBeep,
      900
    );


  showAlarmBox(task);

}


/* =========================
   STOP ALARM
========================= */

function stopAlarm() {

  if (alarmInterval) {

    clearInterval(
      alarmInterval
    );

    alarmInterval = null;

  }


  const alarmBox =
    document.getElementById(
      "bloomAlarmBox"
    );


  if (alarmBox) {

    alarmBox.remove();

  }

}


/* =========================
   ALARM POPUP
========================= */

function showAlarmBox(task) {

  const existing =
    document.getElementById(
      "bloomAlarmBox"
    );


  if (existing) {
    existing.remove();
  }


  const alarmBox =
    document.createElement(
      "div"
    );


  alarmBox.id =
    "bloomAlarmBox";


  alarmBox.innerHTML = `

    <div class="bloom-alarm-icon">
      🔔
    </div>


    <div class="bloom-alarm-content">


      <strong>
        Bloom Reminder
      </strong>


      <p>
        ${escapeHtml(
          task.title
        )}
      </p>


      ${
        task.reminder

          ? `

            <small>
              Reminder set for
              ${escapeHtml(
                task.reminder
              )}
            </small>

          `

          : ""
      }


    </div>


    <button
      id="stopBloomAlarm"
      type="button"
    >
      Stop Alarm
    </button>

  `;


  document.body.appendChild(
    alarmBox
  );


  document
    .getElementById(
      "stopBloomAlarm"
    )
    ?.addEventListener(
      "click",
      stopAlarm
    );

}


/* =========================
   BROWSER NOTIFICATION
========================= */

function showTaskNotification(task) {

  if (
    "Notification" in window &&
    Notification.permission ===
      "granted"
  ) {

    try {

      new Notification(
        "🌸 Bloom Reminder",
        {
          body:
            task.title
        }
      );

    } catch (error) {

      console.error(
        "Notification failed:",
        error
      );

    }

  }

}


/* =========================
   REMINDER TRIGGER
========================= */

function triggerTaskReminder(task) {

  const reminderId =
    `${task.id}-${task.dueDate}-${normalizeReminderTime(task.reminder)}`;


  if (
    notifiedReminders.includes(
      reminderId
    )
  ) {

    return;

  }


  notifiedReminders.push(
    reminderId
  );


  saveNotifiedReminders();


  startAlarm(task);


  showTaskNotification(
    task
  );

}


/* =========================
   CHECK REMINDERS
========================= */

function checkTaskReminders() {

  const now =
    new Date();


  const today =
    localDateString(
      now
    );


  const hours =
    String(
      now.getHours()
    ).padStart(
      2,
      "0"
    );


  const minutes =
    String(
      now.getMinutes()
    ).padStart(
      2,
      "0"
    );


  const seconds =
    String(
      now.getSeconds()
    ).padStart(
      2,
      "0"
    );


  const currentTime =
    `${hours}:${minutes}:${seconds}`;


  tasks.forEach(
    task => {

      if (
        task.completed ||
        !task.dueDate ||
        !task.reminder
      ) {

        return;

      }

      const normalizedReminder =
        normalizeReminderTime(
          task.reminder
        );

      if (
        task.dueDate === today &&
        normalizedReminder === currentTime
      ) {

        triggerTaskReminder(
          task
        );

      }

    }
  );

}


/* =========================
   CLICK EVENTS
========================= */

document.addEventListener(
  "click",
  event => {


    /* NAVIGATION */

    const nav =
      event.target.closest(
        ".nav-link[data-view]"
      );


    if (nav) {

      event.preventDefault();

      searchTerm = "";


      const input =
        document.querySelector(
          ".search-box input"
        );


      if (input) {

        input.value =
          "";

      }


      navigate(
        nav.dataset.view
      );

      return;

    }


    /* ADD TASK */

    const addButton =
      event.target.closest(
        ".add-task-btn, .empty-add-btn"
      );


    if (addButton) {


      if (
        addButton.id ===
        "clearSearch"
      ) {

        searchTerm =
          "";


        const input =
          document.querySelector(
            ".search-box input"
          );


        if (input) {

          input.value =
            "";

          input.focus();

        }


        renderApp();

        return;

      }


      openModal();

      return;

    }


    /* VIEW ALL */

    if (
      event.target.closest(
        "#viewAllTasks"
      )
    ) {

      searchTerm =
        "";

      navigate(
        "all"
      );

      return;

    }


    /* DASHBOARD STATS */

    const statCard =
      event.target.closest(
        ".stat-card[data-stat-view]"
      );


    if (statCard) {

      searchTerm =
        "";

      navigate(
        statCard.dataset.statView
      );

      return;

    }


    /* CLOSE MODAL */

    if (
      event.target.closest(
        ".close-modal, .cancel-btn"
      ) ||
      event.target.id ===
        "taskModal"
    ) {

      closeModal();

      return;

    }


    /* COMPLETE TASK */

    const card =
      event.target.closest(
        ".task-card"
      );


    if (
      card &&
      event.target.closest(
        ".task-checkbox"
      )
    ) {

      const task =
        tasks.find(
          item =>
            item.id ===
            card.dataset.id
        );


      if (task) {

        task.completed =
          !task.completed;

        saveTasks();

        renderApp();

      }

      return;

    }


    /* DELETE TASK */

    if (
      card &&
      event.target.closest(
        ".delete-task"
      )
    ) {

      tasks =
        tasks.filter(
          item =>
            item.id !==
            card.dataset.id
        );


      saveTasks();

      renderApp();

      return;

    }


    /* NOTIFICATIONS */

    if (
      event.target.closest(
        "#notificationButton"
      )
    ) {

      const pending =
        tasks.filter(
          task =>
            !task.completed
        ).length;


      alert(
        pending

          ? `You have ${pending} pending task${
              pending === 1
                ? ""
                : "s"
            }.`

          : "You're all caught up! 🌸"
      );


      return;

    }


    /* PROFILE */

    if (
      event.target.closest(
        "#profileButton, #profileButtonTop"
      )
    ) {

      navigate(
        "settings"
      );

      return;

    }


    /* TOP THEME */

    if (
      event.target.closest(
        "#themeToggle"
      )
    ) {

      toggleTheme();

      return;

    }


    /* SETTINGS THEME */

    if (
      event.target.closest(
        "#settingsThemeToggle"
      )
    ) {

      toggleTheme();

      return;

    }


    /* SAVE USERNAME */

    if (
      event.target.closest(
        "#saveUserName"
      )
    ) {

      const input =
        document.getElementById(
          "userNameInput"
        );


      if (!input) {
        return;
      }


      const name =
        input.value.trim();


      if (!name) {

        input.focus();

        return;

      }


      saveUserName(
        name
      );


      renderApp();

      return;

    }


    /* CLEAR COMPLETED */

    if (
      event.target.closest(
        "#clearCompleted"
      )
    ) {

      tasks =
        tasks.filter(
          task =>
            !task.completed
        );


      saveTasks();

      renderApp();

      return;

    }


    /* CLEAR ALL */

    if (
      event.target.closest(
        "#clearAllTasks"
      )
    ) {

      const confirmed =
        confirm(
          "Delete all Bloom tasks? This cannot be undone."
        );


      if (confirmed) {

        tasks = [];

        saveTasks();

        renderApp();

      }

      return;

    }

  }
);


/* =========================
   SEARCH
========================= */

document.addEventListener(
  "input",
  event => {

    if (
      !event.target.matches(
        ".search-box input"
      )
    ) {

      return;

    }


    searchTerm =
      event.target.value
        .trim()
        .toLowerCase();


    /*
      Searching from Dashboard
      automatically opens My Tasks.
    */

    if (
      currentView ===
        "dashboard" &&
      searchTerm
    ) {

      currentView =
        "all";

      renderApp();

      return;

    }


    renderTaskViewOnly();

  }
);


/* =========================
   SEARCH VIEW UPDATE
========================= */

function renderTaskViewOnly() {

  if (
    currentView ===
      "dashboard" ||
    currentView ===
      "settings"
  ) {

    renderApp();

    return;

  }


  const app =
    document.getElementById(
      "appView"
    );


  if (!app) {
    return;
  }


  const section =
    app.querySelector(
      ".tasks-section"
    );


  if (!section) {

    renderApp();

    return;

  }


  const visible =
    getFilteredTasks(
      currentView
    );


  const countText =
    section.querySelector(
      ".section-heading p"
    );


  if (countText) {

    countText.textContent =
      `${visible.length} task${
        visible.length === 1
          ? ""
          : "s"
      }`;

  }


  const oldContent =
    section.querySelector(
      ".task-list, .empty-state"
    );


  const holder =
    document.createElement(
      "div"
    );


  holder.innerHTML =
    listMarkup(
      currentView
    );


  const newContent =
    holder.firstElementChild;


  if (
    oldContent &&
    newContent
  ) {

    oldContent.replaceWith(
      newContent
    );

  }

}


/* =========================
   CREATE TASK
========================= */

document.addEventListener(
  "submit",
  event => {

    if (
      event.target.id !==
      "taskForm"
    ) {

      return;

    }


    event.preventDefault();


    const titleInput =
      document.getElementById(
        "taskTitle"
      );


    const descriptionInput =
      document.getElementById(
        "taskDescription"
      );


    const dateInput =
      document.getElementById(
        "taskDate"
      );


    const reminderInput =
      document.getElementById(
        "taskReminder"
      );


    const priorityInput =
      document.getElementById(
        "taskPriority"
      );


    const categoryInput =
      document.getElementById(
        "taskCategory"
      );


    const title =
      titleInput?.value.trim();


    if (!title) {

      titleInput?.focus();

      return;

    }


    const dueDate =
      dateInput?.value || "";


    const reminder =
      normalizeReminderTime(
        reminderInput?.value || ""
      );


    const task = {

      id:
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`,

      title,

      description:
        descriptionInput?.value.trim() ||
        "",

      dueDate,

      reminder,

      priority:
        priorityInput?.value ||
        "medium",

      category:
        categoryInput?.value ||
        "personal",

      completed:
        false,

      createdAt:
        new Date().toISOString()

    };


    tasks.push(task);


    saveTasks();


    event.target.reset();


    closeModal();


    renderApp();

  }
);


/* =========================
   KEYBOARD
========================= */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key ===
      "Escape"
    ) {

      closeModal();

    }

  }
);


/* =========================
   BROWSER HISTORY
========================= */

window.addEventListener(
  "hashchange",
  () => {

    searchTerm =
      "";

    navigate(
      getViewFromHash(),
      false
    );

  }
);


window.addEventListener(
  "popstate",
  () => {

    searchTerm =
      "";

    navigate(
      getViewFromHash(),
      false
    );

  }
);


/* =========================
   AUDIO ACTIVATION
========================= */

document.addEventListener(
  "click",
  () => {

    initializeAlarmAudio();

  },
  { once: true }
);


/* =========================
   REMINDER CHECKING
========================= */

setInterval(
  checkTaskReminders,
  10000
);


checkTaskReminders();


/* =========================
   START BLOOM
========================= */

const savedTheme =
  localStorage.getItem(
    THEME_KEY
  ) || "light";


applyTheme(
  savedTheme
);


navigate(
  getViewFromHash(),
  false
);


updateUserInterface();