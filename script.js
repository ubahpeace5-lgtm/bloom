/* =========================================================
   BLOOM — TASK MANAGER
   ========================================================= */

const CURRENT_USER_KEY = "bloom_current_user";
const AUTH_KEY = "bloom_authenticated";
const THEME_KEY = "bloom_theme";
const USERS_INDEX_KEY = "bloom_users";
const OLD_TASKS_KEY = "bloom_tasks";
const OLD_REMINDERS_KEY = "bloom_notified_reminders";

let currentView = "dashboard";
let searchTerm = "";

let tasks = [];

let audioContext = null;
let alarmInterval = null;
let reminderTimeouts = new Map();

let notifiedReminders = new Set();

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase();
}


function getUserName() {
  return localStorage.getItem(CURRENT_USER_KEY) || "";
}


function getUserKey() {
  return normalizeUsername(getUserName());
}


function isAuthenticated() {
  return localStorage.getItem(AUTH_KEY) === "true";
}


function setCurrentUser(username) {

  const cleanName = String(username || "").trim();

  if (!cleanName) return;

  localStorage.setItem(CURRENT_USER_KEY, cleanName);
  localStorage.setItem(AUTH_KEY, "true");

  const users = getUsersIndex();

  const key = normalizeUsername(cleanName);

  if (!users.includes(key)) {
    users.push(key);
    localStorage.setItem(
      USERS_INDEX_KEY,
      JSON.stringify(users)
    );
  }
}


function getUsersIndex() {

  try {

    const users = JSON.parse(
      localStorage.getItem(USERS_INDEX_KEY) || "[]"
    );

    return Array.isArray(users) ? users : [];

  } catch {

    return [];

  }
}



function getTasksStorageKey(username = getUserName()) {

  const key = normalizeUsername(username);

  return key
    ? `bloom_tasks_${key}`
    : OLD_TASKS_KEY;
}


function getRemindersStorageKey(username = getUserName()) {

  const key = normalizeUsername(username);

  return key
    ? `bloom_notified_reminders_${key}`
    : OLD_REMINDERS_KEY;
}


function loadTasks() {

  try {

    const stored = localStorage.getItem(
      getTasksStorageKey()
    );

    tasks = stored
      ? JSON.parse(stored)
      : [];

    if (!Array.isArray(tasks)) {
      tasks = [];
    }

  } catch {

    tasks = [];

  }
}


function saveTasks() {

  localStorage.setItem(
    getTasksStorageKey(),
    JSON.stringify(tasks)
  );
}


function loadNotifiedReminders() {

  try {

    const stored = localStorage.getItem(
      getRemindersStorageKey()
    );

    const parsed = stored
      ? JSON.parse(stored)
      : [];

    notifiedReminders = new Set(
      Array.isArray(parsed) ? parsed : []
    );

  } catch {

    notifiedReminders = new Set();

  }
}


function saveNotifiedReminders() {

  localStorage.setItem(
    getRemindersStorageKey(),
    JSON.stringify(
      Array.from(notifiedReminders)
    )
  );
}



function localDateString(date = new Date()) {

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function normalizeReminderTime(value) {

  if (!value) return "";

  let raw = String(value).trim();

  if (/^\d{6}$/.test(raw)) {
    raw = `${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4, 6)}`;
  }

  const match = raw.match(
    /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/
  );

  if (!match) return "";

  const hours = match[1];
  const minutes = match[2];
  const seconds = match[3] || "00";

  return `${hours}:${minutes}:${seconds}`;
}



function formatReminderTime(value) {

  return normalizeReminderTime(value);

}


function getReminderDateTime(task) {

  if (!task.reminder) {
    return null;
  }

  const date =
    task.reminderDate ||
    task.dueDate ||
    localDateString();

  const normalized = normalizeReminderTime(
    task.reminder
  );

  if (!normalized) {
    return null;
  }

  const dateTime = new Date(
    `${date}T${normalized}`
  );

  if (Number.isNaN(dateTime.getTime())) {
    return null;
  }

  return dateTime;
}



function escapeHtml(value) {

  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}

function getInitial(name) {

  const clean = String(name || "").trim();

  return clean
    ? clean.charAt(0).toUpperCase()
    : "U";

}


function updateProfileUI() {

  const name = getUserName();

  const initial = getInitial(name);

  const sidebarName =
    document.getElementById("sidebarUserName");

  const topName =
    document.getElementById("topUserName");

  const sidebarAvatar =
    document.getElementById("sidebarProfileAvatar");

  const topAvatar =
    document.getElementById("topProfileAvatar");

  if (sidebarName) {
    sidebarName.textContent = name || "User";
  }

  if (topName) {
    topName.textContent = name || "User";
  }

  if (sidebarAvatar) {
    sidebarAvatar.textContent = initial;
  }

  if (topAvatar) {
    topAvatar.textContent = initial;
  }

}


/* =========================================================
   THEME
   ========================================================= */

function applySavedTheme() {

  const savedTheme =
    localStorage.getItem(THEME_KEY);

  if (savedTheme === "dark") {

    document.body.classList.add("dark-mode");

  } else {

    document.body.classList.remove("dark-mode");

  }

  updateThemeButton();

}


function updateThemeButton() {

  const icon =
    document.getElementById("themeIcon");

  const text =
    document.getElementById("themeText");

  const dark =
    document.body.classList.contains("dark-mode");


  if (dark) {

    /*
      Yellow moon in Dark Mode.
    */

    if (icon) {
      icon.textContent = "🌙";
    }

    if (text) {
      text.textContent = "Dark Mode";
    }

  } else {

    /*
      Pretty sun symbol for Light Mode.
    */

    if (icon) {
      icon.textContent = "☼";
    }

    if (text) {
      text.textContent = "Light Mode";
    }

  }

}


function toggleTheme() {

  const dark =
    document.body.classList.toggle("dark-mode");

  localStorage.setItem(
    THEME_KEY,
    dark ? "dark" : "light"
  );

  updateThemeButton();

  renderApp();

}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function updateNotificationUI() {

  const button =
    document.getElementById("notificationButton");

  if (!button) return;


  if (!("Notification" in window)) {

    button.title =
      "Browser notifications are not supported";

    return;

  }


  if (Notification.permission === "granted") {

    button.title =
      "Notifications are enabled";

  } else if (
    Notification.permission === "denied"
  ) {

    button.title =
      "Notifications are blocked in browser settings";

  } else {

    button.title =
      "Enable notifications";

  }

}


function isNotificationEnvironmentSupported() {

  if (!("Notification" in window)) {
    return false;
  }


  /*
     Browser notifications need HTTPS or localhost.
     Opening index.html directly as file:// can prevent
     the permission request from working.
  */

  const isLocalhost =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";

  const isHttps =
    location.protocol === "https:";

  return isHttps || isLocalhost;

}


async function requestNotificationPermission() {

  if (!("Notification" in window)) {

    alert(
      "Browser notifications are not supported on this device."
    );

    return false;

  }


  if (!isNotificationEnvironmentSupported()) {

    alert(
      "Bloom browser notifications need a secure connection.\n\n" +
      "If you are using VS Code, open Bloom with Live Server " +
      "instead of opening the HTML file directly."
    );

    return false;

  }


  if (Notification.permission === "granted") {

    updateNotificationUI();

    alert(
      "Bloom notifications are already enabled."
    );

    return true;

  }


  if (Notification.permission === "denied") {

    updateNotificationUI();

    alert(
      "Notifications are blocked for Bloom in your browser. " +
      "Open your browser's site settings and allow notifications."
    );

    return false;

  }


  try {

    const permission =
      await Notification.requestPermission();

    updateNotificationUI();


    if (permission === "granted") {

      alert(
        "Bloom notifications are now enabled."
      );

      return true;

    }


    if (permission === "denied") {

      alert(
        "Bloom notifications were blocked. " +
        "You can allow them later from your browser site settings."
      );

    }

    return false;

  } catch (error) {

    console.error(
      "Notification permission error:",
      error
    );

    return false;

  }

}


/* =========================================================
   ALARM AUDIO
   ========================================================= */

function initializeAlarmAudio() {

  if (audioContext) {
    return;
  }

  try {

    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) {
      return;
    }

    audioContext = new AudioContext();

  } catch (error) {

    console.error(
      "Audio initialization failed:",
      error
    );

    audioContext = null;

  }

}


async function resumeAlarmAudio() {

  initializeAlarmAudio();

  if (!audioContext) {
    return;
  }

  try {

    if (
      audioContext.state === "suspended"
    ) {

      await audioContext.resume();

    }

  } catch (error) {

    console.error(
      "Could not resume alarm audio:",
      error
    );

  }

}


/*
   Two-tone Bloom reminder sound.
*/

function playAlarmBeep() {

  if (!audioContext) {
    return;
  }

  try {

    const now =
      audioContext.currentTime;


    const notes = [
      {
        frequency: 880,
        start: 0
      },
      {
        frequency: 1174.66,
        start: 0.18
      }
    ];


    notes.forEach(note => {

      const oscillator =
        audioContext.createOscillator();

      const gain =
        audioContext.createGain();


      oscillator.type = "sine";

      oscillator.frequency.setValueAtTime(
        note.frequency,
        now + note.start
      );


      gain.gain.setValueAtTime(
        0.0001,
        now + note.start
      );

      gain.gain.exponentialRampToValueAtTime(
        0.32,
        now + note.start + 0.03
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + note.start + 0.45
      );


      oscillator.connect(gain);

      gain.connect(
        audioContext.destination
      );


      oscillator.start(
        now + note.start
      );

      oscillator.stop(
        now + note.start + 0.5
      );

    });

  } catch (error) {

    console.error(
      "Alarm sound error:",
      error
    );

  }

}


async function startAlarm() {

  stopAlarm();

  await resumeAlarmAudio();

  if (audioContext?.state === "running") {
    playAlarmBeep();
  }


  alarmInterval = setInterval(() => {

    resumeAlarmAudio()
      .then(() => {
        if (audioContext?.state === "running") {
          playAlarmBeep();
        }
      })
      .catch(() => {});

  }, 1300);

}


function stopAlarm() {

  if (alarmInterval) {

    clearInterval(alarmInterval);

    alarmInterval = null;

  }

}


/* =========================================================
   ALARM BOX
   ========================================================= */

function showAlarmBox(task) {

  const box =
    document.getElementById("bloomAlarmBox");

  const text =
    document.getElementById("bloomAlarmText");


  if (!box || !text) {
    return;
  }


  text.textContent =
    `Due task: "${task.title}"`;


  box.classList.add("show");


  startAlarm();

}


function hideAlarmBox() {

  const box =
    document.getElementById("bloomAlarmBox");

  if (box) {
    box.classList.remove("show");
  }

  stopAlarm();

}


function triggerTaskReminder(task) {

  const reminderDate =
    getReminderDateTime(task);

  if (!reminderDate) {
    return;
  }


  const reminderKey =
    `${task.id}_${localDateString(reminderDate)}_${normalizeReminderTime(task.reminder)}`;


  if (notifiedReminders.has(reminderKey)) {
    return;
  }


  notifiedReminders.add(
    reminderKey
  );

  saveNotifiedReminders();


  /*
     Always show and ring the Bloom alarm.
     Browser notification is an additional feature.
  */

  showAlarmBox(task);


  if (
    "Notification" in window &&
    Notification.permission === "granted"
  ) {

    try {

      new Notification(
        "Bloom Reminder",
        {
          body: `"${task.title}" is due now.`,
          tag: reminderKey
        }
      );

    } catch (error) {

      console.error(
        "Browser notification failed:",
        error
      );

    }

  }

}


function checkTaskReminders() {

  if (!getUserName()) {
    return;
  }


  const now = new Date();


  tasks.forEach(task => {

    if (
      task.completed ||
      !task.reminder
    ) {
      return;
    }


    const reminderDate =
      getReminderDateTime(task);

    if (!reminderDate) {
      return;
    }


    const difference =
      now.getTime() -
      reminderDate.getTime();


    /*
       The 2-minute window lets Bloom catch a reminder
       if the browser briefly delays JavaScript.
    */

    if (
      difference >= 0 &&
      difference <= 120000
    ) {

      triggerTaskReminder(task);

    }

  });

}


function clearReminderTimer(taskId) {

  const timeoutId = reminderTimeouts.get(taskId);

  if (timeoutId) {
    clearTimeout(timeoutId);
    reminderTimeouts.delete(taskId);
  }

}


function scheduleTaskReminder(task) {

  clearReminderTimer(task.id);

  if (task.completed || !task.reminder) {
    return;
  }

  const reminderDate = getReminderDateTime(task);

  if (!reminderDate) {
    return;
  }

  const delay = reminderDate.getTime() - Date.now();

  if (delay <= 0) {
    checkTaskReminders();
    return;
  }

  const timeoutId = setTimeout(() => {
    reminderTimeouts.delete(task.id);

    const currentTask = tasks.find(item => item.id === task.id);

    if (currentTask && !currentTask.completed) {
      triggerTaskReminder(currentTask);
    }
  }, delay);

  reminderTimeouts.set(task.id, timeoutId);

}


function scheduleAllTaskReminders() {

  reminderTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
  reminderTimeouts.clear();

  tasks.forEach(scheduleTaskReminder);

}


async function createTask(form) {

  const titleInput =
    document.getElementById("taskTitle");

  const descriptionInput =
    document.getElementById("taskDescription");

  const dateInput =
    document.getElementById("taskDate");

  const reminderInput =
    document.getElementById("taskReminder");

  const priorityInput =
    document.getElementById("taskPriority");

  const categoryInput =
    document.getElementById("taskCategory");


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


  /*
     Reminder is OPTIONAL.
     If empty, Bloom creates the task normally
     without an alarm.
  */


  const task = {

    id:
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,

    title,

    description:
      descriptionInput?.value.trim() || "",

    dueDate,

    reminder,

    reminderDate:
      reminder
        ? (dueDate || localDateString())
        : "",

    priority:
      priorityInput?.value || "medium",

    category:
      categoryInput?.value || "personal",

    completed: false,

    createdAt:
      new Date().toISOString()

  };


  /*
     Activate audio during the user's task-creation click.
     This helps browsers allow the alarm later.
  */

  if (reminder) {

    initializeAlarmAudio();

    await resumeAlarmAudio();


    /*
       If notifications haven't been answered yet,
       ask while the user is actively creating a reminder.
    */

    if (
      "Notification" in window &&
      Notification.permission === "default"
    ) {

      requestNotificationPermission();

    }

  }


  tasks.push(task);

  saveTasks();
  scheduleTaskReminder(task);


  closeModal();

  form.reset();


  renderApp();

}


function deleteTask(taskId) {

  clearReminderTimer(taskId);

  tasks =
    tasks.filter(
      task => task.id !== taskId
    );


  saveTasks();


  const prefix =
    `${taskId}_`;


  notifiedReminders =
    new Set(
      Array.from(notifiedReminders)
        .filter(
          key => !key.startsWith(prefix)
        )
    );


  saveNotifiedReminders();


  renderApp();

}

function toggleTask(taskId) {

  const task =
    tasks.find(
      item => item.id === taskId
    );


  if (!task) {
    return;
  }


  task.completed =
    !task.completed;


  saveTasks();


  if (task.completed) {

    clearReminderTimer(task.id);

    const prefix =
      `${task.id}_`;

    notifiedReminders =
      new Set(
        Array.from(notifiedReminders)
          .filter(
            key => !key.startsWith(prefix)
          )
      );

    saveNotifiedReminders();

  } else {

    scheduleTaskReminder(task);

  }


  renderApp();

}


function openModal(id) {

  const modal =
    document.getElementById(id);

  if (!modal) {
    return;
  }

  modal.classList.add("show");

  modal.setAttribute(
    "aria-hidden",
    "false"
  );

}


function closeModal(id) {

  const modalId =
    id || "taskModal";

  const modal =
    document.getElementById(modalId);

  if (!modal) {
    return;
  }

  modal.classList.remove("show");

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

}


function getFilteredTasks() {

  let filtered =
    [...tasks];


  if (currentView === "today") {

    const today =
      localDateString();

    filtered =
      filtered.filter(
        task =>
          task.dueDate === today
      );

  }


  else if (currentView === "upcoming") {

    const today =
      localDateString();

    filtered =
      filtered.filter(
        task =>
          task.dueDate &&
          task.dueDate > today &&
          !task.completed
      );

  }


  else if (currentView === "completed") {

    filtered =
      filtered.filter(
        task => task.completed
      );

  }


  else if (
    ["school", "work", "personal", "errands"]
      .includes(currentView)
  ) {

    filtered =
      filtered.filter(
        task =>
          task.category === currentView
      );

  }


  if (searchTerm) {

    const query =
      searchTerm.toLowerCase();


    filtered =
      filtered.filter(task => {

        return (

          task.title
            .toLowerCase()
            .includes(query)

          ||

          task.description
            .toLowerCase()
            .includes(query)

          ||

          task.category
            .toLowerCase()
            .includes(query)

        );

      });

  }


  return filtered;

}


function taskCard(task) {

  const reminder =
    task.reminder
      ? `
        <span>•</span>
        <span>♧ ${escapeHtml(
          formatReminderTime(task.reminder)
        )}</span>
      `
      : "";


  const dueDate =
    task.dueDate
      ? `
        <span>•</span>
        <span>${escapeHtml(
          task.dueDate
        )}</span>
      `
      : "";


  return `

    <article
      class="task-card ${task.completed ? "completed" : ""}"
      data-task-id="${task.id}"
    >

      <div class="task-check-area">

        <button
          class="task-check ${task.completed ? "checked" : ""}"
          data-action="toggle"
          data-id="${task.id}"
          type="button"
          aria-label="Mark task complete"
        >
          ${task.completed ? "✓" : ""}
        </button>

      </div>


      <div class="task-main">

        <div class="task-top">

          <h3>
            ${escapeHtml(task.title)}
          </h3>

          <span class="priority-badge ${escapeHtml(task.priority)}">
            ${escapeHtml(task.priority)}
          </span>

        </div>


        ${
          task.description
            ? `
              <p class="task-description">
                ${escapeHtml(task.description)}
              </p>
            `
            : ""
        }


        <div class="task-meta">

          <span class="category-label">
            ${escapeHtml(task.category)}
          </span>

          ${dueDate}

          ${reminder}

        </div>

      </div>


      <button
        class="task-delete"
        data-action="delete"
        data-id="${task.id}"
        type="button"
        aria-label="Delete task"
        title="Delete task"
      >
        ×
      </button>

    </article>

  `;

}


function greeting() {

  const hour =
    new Date().getHours();


  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";

}


function dashboardMarkup() {

  const name =
    getUserName() || "User";


  const total =
    tasks.length;


  const completed =
    tasks.filter(
      task => task.completed
    ).length;


  const pending =
    total - completed;


  const today =
    localDateString();


  const todayTasks =
    tasks.filter(
      task =>
        task.dueDate === today &&
        !task.completed
    );


  const recentTasks =
    [...tasks]
      .sort(
        (a, b) =>
          new Date(b.createdAt) -
          new Date(a.createdAt)
      )
      .slice(0, 5);


  return `

    <section class="dashboard-header">

      <div>

        <p class="eyebrow">
          ${greeting()}
        </p>

        <h1>
          ${escapeHtml(name)}.
        </h1>

        <p class="dashboard-subtitle">
          Let's make today productive.
        </p>

      </div>


      <button
        class="primary-btn"
        data-action="open-task"
        type="button"
      >
        + Add Task
      </button>

    </section>


    <section class="stats-grid">

      <div class="stat-card">

        <span class="stat-icon">☷</span>

        <div>
          <small>Total Tasks</small>
          <strong>${total}</strong>
        </div>

      </div>


      <div class="stat-card">

        <span class="stat-icon">◷</span>

        <div>
          <small>Pending</small>
          <strong>${pending}</strong>
        </div>

      </div>


      <div class="stat-card">

        <span class="stat-icon">✓</span>

        <div>
          <small>Completed</small>
          <strong>${completed}</strong>
        </div>

      </div>


      <div class="stat-card">

        <span class="stat-icon">□</span>

        <div>
          <small>Due Today</small>
          <strong>${todayTasks.length}</strong>
        </div>

      </div>

    </section>


    <section class="dashboard-grid">

      <div class="content-card">

        <div class="section-heading">

          <div>
            <p class="eyebrow">YOUR WORK</p>
            <h2>Recent Tasks</h2>
          </div>

          <button
            class="text-btn"
            data-action="view-all"
            type="button"
          >
            View all
          </button>

        </div>


        <div class="task-list">

          ${
            recentTasks.length
              ? recentTasks
                  .map(taskCard)
                  .join("")
              : `
                <div class="empty-state">
                  <div class="empty-icon">✦</div>
                  <h3>No tasks yet</h3>
                  <p>
                    Add your first task and let Bloom
                    help you stay organized.
                  </p>
                  <button
                    class="primary-btn"
                    data-action="open-task"
                    type="button"
                  >
                    Create First Task
                  </button>
                </div>
              `
          }

        </div>

      </div>


      <div class="content-card today-card">

        <div class="section-heading">

          <div>
            <p class="eyebrow">TODAY</p>
            <h2>Today's Focus</h2>
          </div>

        </div>


        ${
          todayTasks.length
            ? `
              <div class="task-list compact-list">
                ${todayTasks
                  .map(taskCard)
                  .join("")}
              </div>
            `
            : `
              <div class="focus-empty">
                <div class="focus-icon">✓</div>
                <h3>You're all clear!</h3>
                <p>
                  Nothing is due today.
                </p>
              </div>
            `
        }

      </div>

    </section>

  `;

}



function taskListMarkup() {

  const filtered =
    getFilteredTasks();


  let title = "My Tasks";


  if (currentView === "today") {
    title = "Today's Tasks";
  }

  else if (currentView === "upcoming") {
    title = "Upcoming Tasks";
  }

  else if (currentView === "completed") {
    title = "Completed Tasks";
  }

  else if (
    ["school", "work", "personal", "errands"]
      .includes(currentView)
  ) {

    const names = {
      school: "School Work",
      work: "Work",
      personal: "Personal",
      errands: "Errands"
    };

    title = names[currentView];

  }


  return `

    <section class="page-header">

      <div>

        <p class="eyebrow">
          BLOOM
        </p>

        <h1>
          ${title}
        </h1>

        <p>
          Stay organized and keep moving forward.
        </p>

      </div>


      <button
        class="primary-btn"
        data-action="open-task"
        type="button"
      >
        + Add Task
      </button>

    </section>


    <section class="content-card full-width-card">

      <div class="section-heading">

        <div>
          <h2>
            ${filtered.length}
            ${filtered.length === 1 ? "task" : "tasks"}
          </h2>
        </div>

      </div>


      <div class="task-list">

        ${
          filtered.length
            ? filtered
                .map(taskCard)
                .join("")
            : `
              <div class="empty-state">
                <div class="empty-icon">✦</div>

                <h3>
                  No tasks found
                </h3>

                <p>
                  There are no tasks in this section yet.
                </p>

                <button
                  class="primary-btn"
                  data-action="open-task"
                  type="button"
                >
                  Add a Task
                </button>

              </div>
            `
        }

      </div>

    </section>

  `;

}


function settingsMarkup() {

  const dark =
    document.body.classList.contains("dark-mode");


  let notificationStatus =
    "Notifications are not enabled yet.";


  let notificationButton =
    "Enable Notifications";


  if ("Notification" in window) {

    if (
      Notification.permission === "granted"
    ) {

      notificationStatus =
        "Browser notifications are enabled.";

      notificationButton =
        "Notifications Enabled";

    }

    else if (
      Notification.permission === "denied"
    ) {

      notificationStatus =
        "Notifications are blocked in your browser settings.";

      notificationButton =
        "Notifications Blocked";

    }

  } else {

    notificationStatus =
      "This browser does not support notifications.";

    notificationButton =
      "Not Supported";

  }


  return `

    <section class="page-header">

      <div>

        <p class="eyebrow">
          BLOOM
        </p>

        <h1>
          Settings
        </h1>

        <p>
          Personalize your Bloom experience.
        </p>

      </div>

    </section>


    <section class="settings-card">

      <div class="setting-row">

        <div class="setting-info">

          <strong>
            Appearance
          </strong>

          <p>
            Current mode:
            ${dark ? "Dark Mode" : "Light Mode"}
          </p>

        </div>


        <button
          class="secondary-btn"
          data-action="toggle-theme"
          type="button"
        >
          ${
            dark
              ? "Switch to Light Mode"
              : "Switch to Dark Mode"
          }
        </button>

      </div>

    </section>


    <section class="settings-card">

      <div class="setting-row">

        <div class="setting-info">

          <strong>
            Notifications
          </strong>

          <p>
            ${notificationStatus}
          </p>

        </div>


        <button
          class="secondary-btn enable-notifications-btn"
          type="button"
        >
          ${notificationButton}
        </button>

      </div>

    </section>


    <section class="settings-card">

      <div class="setting-row">

        <div class="setting-info">

          <strong>
            Username
          </strong>

          <p>
            You're signed in as
            <strong>
              ${escapeHtml(
                getUserName() || "User"
              )}
            </strong>
          </p>

        </div>


        <button
          class="secondary-btn"
          data-action="open-username"
          type="button"
        >
          Change Username
        </button>

      </div>

    </section>

  `;

}


function renderApp() {

  const appView =
    document.getElementById("appView");

  if (!appView) {
    return;
  }


  if (currentView === "dashboard") {

    appView.innerHTML =
      dashboardMarkup();

  }

  else if (currentView === "settings") {

    appView.innerHTML =
      settingsMarkup();

  }

  else {

    appView.innerHTML =
      taskListMarkup();

  }


  updateActiveNavigation();

}


function updateActiveNavigation() {

  document
    .querySelectorAll(
      ".nav-link, .mobile-nav-link, .mobile-category-link"
    )
    .forEach(link => {

      link.classList.toggle(
        "active",
        link.dataset.view === currentView
      );

    });

}


function navigate(view) {

  currentView =
    view || "dashboard";


  searchTerm = "";


  const searchInput =
    document.getElementById("searchInput");

  if (searchInput) {
    searchInput.value = "";
  }


  window.location.hash =
    currentView;


  renderApp();

}


function changeUsername(newUsername) {

  const cleanName =
    String(newUsername || "").trim();


  if (!cleanName) {
    return;
  }


  const oldUser =
    getUserName();


  const oldKey =
    normalizeUsername(oldUser);


  const newKey =
    normalizeUsername(cleanName);


  if (!newKey) {
    return;
  }


  /*
     Keep existing tasks when username changes.
  */

  if (oldKey && oldKey !== newKey) {

    const oldTasks =
      localStorage.getItem(
        getTasksStorageKey(oldUser)
      );


    if (oldTasks) {

      localStorage.setItem(
        getTasksStorageKey(cleanName),
        oldTasks
      );

    }


    const oldReminders =
      localStorage.getItem(
        getRemindersStorageKey(oldUser)
      );


    if (oldReminders) {

      localStorage.setItem(
        getRemindersStorageKey(cleanName),
        oldReminders
      );

    }

  }


  setCurrentUser(cleanName);

  loadTasks();

  loadNotifiedReminders();
  scheduleAllTaskReminders();

  updateProfileUI();

  renderApp();

}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

document.addEventListener(
  "input",
  event => {

    if (event.target.id !== "taskReminder") {
      return;
    }

    const rawValue = event.target.value
      .replace(/[^\d:]/g, "")
      .slice(0, 8);

    if (/^\d{6}$/.test(rawValue)) {
      event.target.value = rawValue.replace(
        /^(\d{2})(\d{2})(\d{2})$/,
        "$1:$2:$3"
      );
    } else {
      event.target.value = rawValue;
    }

  }
);


document.addEventListener(
  "click",
  async event => {
    /* Navigation */

    const navLink =
      event.target.closest(
        ".nav-link, .mobile-nav-link, .mobile-category-link"
      );


    if (navLink) {

      event.preventDefault();

      navigate(
        navLink.dataset.view
      );

      return;

    }


    /* Theme */

    if (
      event.target.closest(
        "#themeToggle"
      )
    ) {

      toggleTheme();

      return;

    }


    /* Notification */

    if (
      event.target.closest(
        "#notificationButton"
      ) ||
      event.target.closest(
        ".enable-notifications-btn"
      )
    ) {

      await requestNotificationPermission();

      renderApp();

      return;

    }


    /* Open task */

    if (
      event.target.closest(
        '[data-action="open-task"]'
      )
    ) {

      openModal("taskModal");

      return;

    }


    /* View all */

    if (
      event.target.closest(
        '[data-action="view-all"]'
      )
    ) {

      navigate("all");

      return;

    }


    /* Toggle theme from settings */

    if (
      event.target.closest(
        '[data-action="toggle-theme"]'
      )
    ) {

      toggleTheme();

      return;

    }


    /* Open username */

    if (
      event.target.closest(
        '[data-action="open-username"]'
      )
    ) {

      openModal("usernameModal");

      return;

    }


    /* Toggle task */

    const toggleButton =
      event.target.closest(
        '[data-action="toggle"]'
      );


    if (toggleButton) {

      toggleTask(
        toggleButton.dataset.id
      );

      return;

    }


    /* Delete task */

    const deleteButton =
      event.target.closest(
        '[data-action="delete"]'
      );


    if (deleteButton) {

      deleteTask(
        deleteButton.dataset.id
      );

      return;

    }


    /* Stop alarm */

    if (
      event.target.closest(
        "#stopBloomAlarm"
      )
    ) {

      hideAlarmBox();

      return;

    }


    /* Profile */

    if (
      event.target.closest(
        "#profileButton"
      ) ||
      event.target.closest(
        "#profileButtonTop"
      )
    ) {

      openModal("usernameModal");

      return;

    }


    /* Close username modal */

    if (
      event.target.closest(
        "#closeUsernameModal"
      ) ||
      event.target.closest(
        "#cancelUsernameChange"
      )
    ) {

      closeModal("usernameModal");

      return;

    }


    /* Close task modal */

    if (
      event.target.closest(
        "#closeTaskModal"
      ) ||
      event.target.closest(
        "#cancelTask"
      )
    ) {

      closeModal("taskModal");

      return;

    }


    /*
       Clicking the overlay itself closes the modal.
    */

    if (
      event.target.classList.contains(
        "modal-overlay"
      )
    ) {

      event.target.classList.remove(
        "show"
      );

      event.target.setAttribute(
        "aria-hidden",
        "true"
      );

    }

  }
);



document.addEventListener(
  "submit",
  async event => {

    event.preventDefault();


    if (
      event.target.id ===
      "signInForm"
    ) {

      const input =
        document.getElementById(
          "signInUsername"
        );


      const username =
        input?.value.trim();


      if (!username) {
        return;
      }


      setCurrentUser(username);

      loadTasks();

      loadNotifiedReminders();

      updateProfileUI();

      closeModal("signInModal");

      renderApp();

      return;

    }


    if (
      event.target.id ===
      "taskForm"
    ) {

      await createTask(
        event.target
      );

      return;

    }


    if (
      event.target.id ===
      "usernameForm"
    ) {

      const input =
        document.getElementById(
          "newUsername"
        );


      changeUsername(
        input?.value
      );


      input.value = "";

      closeModal("usernameModal");

      return;

    }

  }
);



document.addEventListener(
  "input",
  event => {

    if (
      event.target.id ===
      "searchInput"
    ) {

      searchTerm =
        event.target.value.trim();

      renderApp();

    }

  }
);



document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Escape"
    ) {

      document
        .querySelectorAll(
          ".modal-overlay.show"
        )
        .forEach(modal => {

          modal.classList.remove(
            "show"
          );

          modal.setAttribute(
            "aria-hidden",
            "true"
          );

        });

    }

  }
);



function initializeBloom() {

  applySavedTheme();

  updateNotificationUI();


  /*
     If there is no authenticated user,
     show the sign-in screen.
  */

  if (!isAuthenticated() || !getUserName()) {

    const modal =
      document.getElementById(
        "signInModal"
      );

    if (modal) {

      modal.classList.add("show");

      modal.setAttribute(
        "aria-hidden",
        "false"
      );

    }

    return;

  }


  loadTasks();

  loadNotifiedReminders();
  scheduleAllTaskReminders();

  updateProfileUI();


  /*
     Restore current page from URL.
  */

  const hash =
    window.location.hash.replace(
      "#",
      ""
    );


  const allowedViews = [
    "dashboard",
    "all",
    "today",
    "upcoming",
    "completed",
    "school",
    "work",
    "personal",
    "errands",
    "settings"
  ];


  if (
    allowedViews.includes(hash)
  ) {

    currentView = hash;

  }


  renderApp();


  /*
     Check reminders immediately,
     then every second.
  */

  checkTaskReminders();

  setInterval(
    checkTaskReminders,
    1000
  );

}


window.addEventListener(
  "hashchange",
  () => {

    const hash =
      window.location.hash.replace(
        "#",
        ""
      );


    if (hash) {

      currentView =
        hash;

      renderApp();

    }

  }
);


/*
   Initialize alarm audio after the user interacts
   with Bloom. This helps browser autoplay policies.
*/

document.addEventListener(
  "pointerdown",
  () => {

    if (!audioContext) {
      initializeAlarmAudio();
    }

    if (
      audioContext &&
      audioContext.state === "suspended"
    ) {

      audioContext.resume()
        .catch(() => {});

    }

  },
  {
    once: true
  }
);


initializeBloom();