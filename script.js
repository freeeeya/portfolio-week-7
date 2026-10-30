(function () {
    "use strict";

    /* ===== Auto-fill current year ===== */
    var yearEl = document.getElementById("year");
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }

    /* ===== Scroll reveal animation ===== */
    var revealEls = document.querySelectorAll(".reveal");

    if ("IntersectionObserver" in window) {
        var observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15 }
        );

        revealEls.forEach(function (el) {
            observer.observe(el);
        });
    } else {
        // Fallback: show immediately
        revealEls.forEach(function (el) {
            el.classList.add("visible");
        });
    }

    /* ===== Contact form interaction ===== */
    var form = document.getElementById("contactForm");
    var statusEl = document.getElementById("formStatus");

    /* Supabase client for the contact form (separate project from the to-do list) */
    var CONTACTS_SUPABASE_URL = "https://ldayrtaimhfxytqnvarz.supabase.co";
    var CONTACTS_SUPABASE_KEY = "sb_publishable_-5sl1YjqPk9QrU7jDvpsEg_XnMJ5WjL";
    var contactsClient = null;

    if (window.supabase && typeof window.supabase.createClient === "function") {
        try {
            contactsClient = window.supabase.createClient(CONTACTS_SUPABASE_URL, CONTACTS_SUPABASE_KEY);
        } catch (err) {
            console.error("Supabase init for the contact form failed:", err);
        }
    } else {
        console.warn("Supabase SDK not loaded — contact form cannot submit.");
    }

    if (form) {
        form.addEventListener("submit", function (e) {
            e.preventDefault();

            var name = form.name.value.trim();
            var email = form.email.value.trim();
            var message = form.message.value.trim();

            // Simple validation
            if (!name || !email || !message) {
                showStatus("Please fill in all fields.", "error");
                return;
            }

            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showStatus("Please enter a valid email address.", "error");
                return;
            }

            // Submit to Supabase `contacts` table
            var submitBtn = form.querySelector(".form-submit");
            var originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = "Sending...";
            showStatus("", "");

            var request;
            if (contactsClient) {
                request = contactsClient
                    .from("contacts")
                    .insert({ name: name, email: email, message: message })
                    .then(function (res) {
                        if (res.error) throw res.error;
                        return res;
                    });
            } else {
                request = Promise.reject(new Error("Supabase client unavailable"));
            }

            request
                .then(function () {
                    showStatus("Message sent. I'll get back to you soon.", "success");
                    form.reset();
                })
                .catch(function (err) {
                    console.error("Failed to save contact message:", err);
                    showStatus("Couldn't send right now — please try again or email me directly.", "error");
                })
                .then(function () {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                });
        });
    }

    function showStatus(msg, type) {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = "form-status " + (type || "");
    }

    /* ===== Highlight current section in nav (optional enhancement) ===== */
    var navLinks = document.querySelectorAll(".nav-links a");
    var sections = document.querySelectorAll("section[id]");

    if ("IntersectionObserver" in window && sections.length) {
        var navObserver = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        var id = entry.target.id;
                        navLinks.forEach(function (link) {
                            var isActive = link.getAttribute("href") === "#" + id;
                            link.style.color = isActive
                                ? "var(--color-text)"
                                : "";
                        });
                    }
                });
            },
            { rootMargin: "-40% 0px -55% 0px" }
        );

        sections.forEach(function (sec) {
            navObserver.observe(sec);
        });
    }

    /* ===== To-do App ===== */
    var STORAGE_KEY = "todo.tasks.v1";
    var SUPABASE_URL = "https://wzhzqxdxzwdheiogcpkg.supabase.co";
    var SUPABASE_ANON_KEY = "sb_publishable_JiaSyniD0wN962ADZ2ZcRw_jaYK7UYR";
    var MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    var SHORT_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var PRIORITY_META = {
        low: { emoji: "🟢", label: "Low" },
        medium: { emoji: "🟡", label: "Medium" },
        high: { emoji: "🔴", label: "High" }
    };

    var calGrid = document.getElementById("calGrid");
    var calTitle = document.getElementById("calTitle");
    var calPrev = document.getElementById("calPrev");
    var calNext = document.getElementById("calNext");
    var todoForm = document.getElementById("todoForm");
    var todoInput = document.getElementById("todoInput");
    var todoList = document.getElementById("todoList");
    var todoEmpty = document.getElementById("todoEmpty");
    var todoSelectedDate = document.getElementById("todoSelectedDate");
    var todoCounter = document.getElementById("todoCounter");
    var priorityPicker = document.getElementById("priorityPicker");

    /* Supabase client (singleton, never shadow the global `supabase`) */
    var sbClient = null;
    if (window.supabase && typeof window.supabase.createClient === "function") {
        try {
            sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } catch (err) {
            console.warn("Supabase init failed, falling back to localStorage:", err);
        }
    } else {
        console.warn("Supabase SDK not loaded, using localStorage only.");
    }

    if (calGrid && calTitle) {
        var tasks = [];
        var viewYear = new Date().getFullYear();
        var viewMonth = new Date().getMonth();
        var todayStr = isoDate(new Date());
        var selectedStr = todayStr;
        var selectedPriority = "medium";

        renderCalendar();
        updateSelectedDateLabel();
        renderList();
        loadTasks().then(function (loaded) {
            tasks = loaded;
            renderCalendar();
            renderList();
        });

        calPrev.addEventListener("click", function () {
            viewMonth -= 1;
            if (viewMonth < 0) {
                viewMonth = 11;
                viewYear -= 1;
            }
            renderCalendar();
        });

        calNext.addEventListener("click", function () {
            viewMonth += 1;
            if (viewMonth > 11) {
                viewMonth = 0;
                viewYear += 1;
            }
            renderCalendar();
        });

        calGrid.addEventListener("click", function (e) {
            var btn = e.target.closest(".cal-day:not(.empty)");
            if (!btn) return;
            selectedStr = btn.dataset.date;
            updateSelectedDateLabel();
            renderCalendar();
        });

        if (priorityPicker) {
            priorityPicker.addEventListener("click", function (e) {
                var btn = e.target.closest(".priority-btn");
                if (!btn) return;
                selectedPriority = btn.dataset.priority;
                priorityPicker.querySelectorAll(".priority-btn").forEach(function (b) {
                    b.classList.toggle("active", b === btn);
                });
            });
        }

        if (todoForm) {
            todoForm.addEventListener("submit", function (e) {
                e.preventDefault();
                var text = todoInput.value.trim();
                if (!text || !selectedStr) return;
                var localId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                var newTask = {
                    id: localId,
                    text: text,
                    date: selectedStr,
                    priority: selectedPriority,
                    done: false
                };
                tasks.push(newTask);
                todoInput.value = "";
                renderCalendar();
                renderList();

                sbInsertTask(newTask).then(function (saved) {
                    if (saved && saved.id) {
                        newTask.id = saved.id;
                        renderList();
                    }
                }).catch(function (err) {
                    console.error("Failed to save task to Supabase:", err);
                });
            });
        }

        if (todoList) {
            todoList.addEventListener("click", function (e) {
                var item = e.target.closest(".todo-item");
                if (!item) return;
                var id = item.dataset.id;

                if (e.target.closest(".todo-delete")) {
                    tasks = tasks.filter(function (t) { return t.id !== id; });
                    renderCalendar();
                    renderList();
                    sbDeleteTask(id).catch(function (err) {
                        console.error("Failed to delete task from Supabase:", err);
                    });
                } else if (e.target.closest(".todo-checkbox")) {
                    var done = false;
                    tasks.forEach(function (t) {
                        if (t.id === id) {
                            t.done = !t.done;
                            done = t.done;
                        }
                    });
                    renderList();
                    sbUpdateTask(id, { done: done }).catch(function (err) {
                        console.error("Failed to update task in Supabase:", err);
                    });
                } else if (e.target.closest(".todo-text")) {
                    startEdit(item, id);
                }
            });
        }
    }

    function isoDate(d) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, "0");
        var day = String(d.getDate()).padStart(2, "0");
        return y + "-" + m + "-" + day;
    }

    function parseIsoDate(s) {
        var parts = s.split("-");
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }

    function formatDisplayDate(s) {
        var d = parseIsoDate(s);
        return SHORT_MONTH[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
    }

    function loadTasks() {
        if (!sbClient) {
            return Promise.resolve(loadFromLocal());
        }
        return sbClient
            .from("todos")
            .select("*")
            .order("created_at", { ascending: true })
            .then(function (res) {
                if (res.error) throw res.error;
                var rows = Array.isArray(res.data) ? res.data : [];
                return rows.map(normalizeTask);
            })
            .catch(function (err) {
                console.error("Failed to load tasks from Supabase, using localStorage:", err);
                return loadFromLocal();
            });
    }

    function loadFromLocal() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.map(normalizeTask) : [];
        } catch (err) {
            return [];
        }
    }

    function saveToLocal() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        } catch (err) {
            /* storage unavailable - ignore */
        }
    }

    /* Map a DB row to the task shape used by the UI.
       Columns on the `todos` table: id, task, is_complete, date, created_at.
       (No `priority` column yet — priority defaults to "medium" until one is added.) */
    function normalizeTask(row) {
        return {
            id: row.id != null ? String(row.id) : row.id,
            text: row.task || "",
            date: row.date || todayStr,
            priority: row.priority || "medium",
            done: !!row.is_complete
        };
    }

    /* Map UI field names to DB column names */
    function mapFieldsToDb(fields) {
        var out = {};
        if (fields.text !== undefined) out.task = fields.text;
        if (fields.done !== undefined) out.is_complete = !!fields.done;
        if (fields.date !== undefined) out.date = fields.date;
        if (fields.priority !== undefined) out.priority = fields.priority;
        return out;
    }

    /* Supabase writes */
    function sbInsertTask(task) {
        if (!sbClient) {
            saveToLocal();
            return Promise.resolve(task);
        }
        var payload = {
            task: task.text,
            is_complete: !!task.done,
            date: task.date
        };
        return sbClient
            .from("todos")
            .insert(payload)
            .select()
            .then(function (res) {
                if (res.error) throw res.error;
                saveToLocal();
                return res.data && res.data[0] ? normalizeTask(res.data[0]) : task;
            });
    }

    function sbUpdateTask(id, fields) {
        if (!sbClient) {
            saveToLocal();
            return Promise.resolve();
        }
        var mapped = mapFieldsToDb(fields);
        if (Object.keys(mapped).length === 0) return Promise.resolve();
        return sbClient
            .from("todos")
            .update(mapped)
            .eq("id", id)
            .then(function (res) {
                if (res.error) throw res.error;
                saveToLocal();
            });
    }

    function sbDeleteTask(id) {
        if (!sbClient) {
            saveToLocal();
            return Promise.resolve();
        }
        return sbClient
            .from("todos")
            .delete()
            .eq("id", id)
            .then(function (res) {
                if (res.error) throw res.error;
                saveToLocal();
            });
    }

    function tasksByDate() {
        var map = {};
        tasks.forEach(function (t) {
            if (!map[t.date]) map[t.date] = 0;
            map[t.date] += 1;
        });
        return map;
    }

    function updateSelectedDateLabel() {
        if (todoSelectedDate) {
            todoSelectedDate.textContent = selectedStr ? formatDisplayDate(selectedStr) : "—";
        }
    }

    function renderCalendar() {
        if (!calGrid || !calTitle) return;
        calTitle.textContent = MONTH_NAMES[viewMonth] + " " + viewYear;
        calGrid.innerHTML = "";

        var firstDay = new Date(viewYear, viewMonth, 1).getDay();
        var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        var taskMap = tasksByDate();

        for (var i = 0; i < firstDay; i++) {
            var empty = document.createElement("div");
            empty.className = "cal-day empty";
            calGrid.appendChild(empty);
        }

        for (var day = 1; day <= daysInMonth; day++) {
            var dateStr = isoDate(new Date(viewYear, viewMonth, day));
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "cal-day";
            btn.dataset.date = dateStr;
            btn.textContent = String(day);
            if (dateStr === todayStr) btn.classList.add("today");
            if (dateStr === selectedStr) btn.classList.add("selected");
            if (taskMap[dateStr]) btn.classList.add("has-tasks");
            calGrid.appendChild(btn);
        }
    }

    function updateCounter() {
        if (!todoCounter) return;
        var total = tasks.length;
        var done = tasks.filter(function (t) { return t.done; }).length;
        if (total === 0) {
            todoCounter.hidden = true;
            todoCounter.textContent = "";
            return;
        }
        todoCounter.hidden = false;
        todoCounter.innerHTML = "<strong>" + done + " of " + total + "</strong> task" +
            (total === 1 ? "" : "s") + " completed";
    }

    function renderList() {
        if (!todoList || !todoEmpty) return;
        updateCounter();

        if (tasks.length === 0) {
            todoList.innerHTML = "";
            todoEmpty.classList.remove("hidden");
            return;
        }
        todoEmpty.classList.add("hidden");

        var sorted = tasks.slice().sort(function (a, b) {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            return a.id < b.id ? -1 : 1;
        });

        todoList.innerHTML = "";
        sorted.forEach(function (t) {
            var li = document.createElement("li");
            li.className = "todo-item" + (t.done ? " done" : "");
            li.dataset.id = t.id;

            var checkbox = document.createElement("div");
            checkbox.className = "todo-checkbox" + (t.done ? " checked" : "");
            checkbox.setAttribute("role", "checkbox");
            checkbox.setAttribute("aria-checked", t.done ? "true" : "false");
            checkbox.setAttribute("tabindex", "0");

            var prio = t.priority || "medium";
            var meta = PRIORITY_META[prio] || PRIORITY_META.medium;
            var priority = document.createElement("span");
            priority.className = "todo-priority todo-priority--" + prio;
            priority.textContent = meta.emoji + " " + meta.label;
            priority.title = meta.label + " priority";

            var text = document.createElement("span");
            text.className = "todo-text";
            text.textContent = t.text;
            text.title = "Click to edit";

            var dateBadge = document.createElement("span");
            dateBadge.className = "todo-date";
            dateBadge.textContent = formatDisplayDate(t.date);

            var del = document.createElement("button");
            del.type = "button";
            del.className = "todo-delete";
            del.setAttribute("aria-label", "Delete task");
            del.innerHTML = "&times;";

            li.appendChild(checkbox);
            li.appendChild(priority);
            li.appendChild(text);
            li.appendChild(dateBadge);
            li.appendChild(del);
            todoList.appendChild(li);
        });
    }

    function startEdit(li, id) {
        var span = li.querySelector(".todo-text");
        if (!span || li.querySelector(".todo-edit-input")) return;

        var currentText = span.textContent;
        var input = document.createElement("input");
        input.type = "text";
        input.className = "todo-edit-input";
        input.value = currentText;
        input.maxLength = 120;
        input.setAttribute("aria-label", "Edit task");
        span.replaceWith(input);
        input.focus();
        input.select();

        var finished = false;

        function save() {
            if (finished) return;
            finished = true;
            var val = input.value.trim();
            if (!val) {
                renderList();
                return;
            }
            tasks.forEach(function (t) {
                if (t.id === id) t.text = val;
            });
            renderList();
            sbUpdateTask(id, { text: val }).catch(function (err) {
                console.error("Failed to update task text in Supabase:", err);
            });
        }

        function cancel() {
            if (finished) return;
            finished = true;
            renderList();
        }

        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                save();
            } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
            }
        });
        input.addEventListener("blur", function () {
            save();
        });
    }

    /* ===== Weather App ===== */
    var WEATHER_API = "https://uapis.cn/api/v1/misc/weather";

    var weatherForm = document.getElementById("weatherForm");
    var weatherInput = document.getElementById("weatherInput");
    var weatherStatus = document.getElementById("weatherStatus");
    var weatherResult = document.getElementById("weatherResult");
    var weatherIcon = document.getElementById("weatherIcon");
    var weatherCity = document.getElementById("weatherCity");
    var weatherTemp = document.getElementById("weatherTemp");
    var weatherCond = document.getElementById("weatherCond");
    var weatherMeta = document.getElementById("weatherMeta");

    /* Map the Chinese condition text from the API to a weather emoji */
    function weatherEmoji(cond) {
        var text = cond || "";
        if (text.indexOf("雷") !== -1) return "⛈️";
        if (text.indexOf("雪") !== -1) return "🌨️";
        if (text.indexOf("雨") !== -1) return "🌧️";
        if (text.indexOf("晴") !== -1) return "☀️";
        if (text.indexOf("多云") !== -1) return "⛅";
        if (text.indexOf("阴") !== -1) return "☁️";
        if (text.indexOf("雾") !== -1 || text.indexOf("霾") !== -1) return "🌫️";
        if (text.indexOf("沙") !== -1 || text.indexOf("尘") !== -1) return "🌪️";
        return "🌤️";
    }

    if (weatherForm) {
        weatherForm.addEventListener("submit", function (e) {
            e.preventDefault();
            var city = weatherInput.value.trim();

            if (!city) {
                weatherResult.hidden = true;
                weatherStatus.textContent = "Enter a city first.";
                return;
            }

            weatherStatus.textContent = "Loading…";
            weatherResult.hidden = true;

            fetch(WEATHER_API + "?city=" + encodeURIComponent(city))
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (!data || data.error) {
                        weatherStatus.textContent = "Couldn't find that city — check the spelling.";
                        return;
                    }
                    weatherIcon.textContent = weatherEmoji(data.weather);
                    weatherCity.textContent = data.city || city;
                    weatherTemp.textContent = (data.temperature != null ? data.temperature : "—") + "°C";
                    weatherCond.textContent = data.weather || "";

                    var metaParts = [];
                    if (data.humidity != null) metaParts.push("Humidity " + data.humidity + "%");
                    if (data.wind_direction) {
                        metaParts.push(data.wind_direction + (data.wind_power ? " " + data.wind_power : ""));
                    }
                    weatherMeta.textContent = metaParts.join(" · ");

                    weatherStatus.textContent = "";
                    weatherResult.hidden = false;
                })
                .catch(function () {
                    weatherStatus.textContent = "Couldn't find that city — check the spelling.";
                });
        });
    }
})();
