import { useEffect, useMemo, useState } from "react";

const STATUS_OPTIONS = ["Submitted", "Pending", "Late"];

function App() {
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState({
    title: "",
    subject: "",
    dueDate: "",
    status: "Pending",
  });
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(false);

  const subjects = useMemo(() => {
    const unique = Array.from(
      new Set(assignments.map((item) => item.subject).filter(Boolean))
    );
    return ["All", ...unique];
  }, [assignments]);

  const today = new Date().toISOString().slice(0, 10);

  const getEffectiveStatus = (assignment) =>
    assignment.status === "Pending" && assignment.dueDate < today
      ? "Late"
      : assignment.status;

  const summary = useMemo(
    () =>
      assignments.reduce(
        (counts, assignment) => {
          const effectiveStatus = getEffectiveStatus(assignment);
          counts.total += 1;
          if (effectiveStatus === "Submitted") counts.submitted += 1;
          if (effectiveStatus === "Pending") counts.pending += 1;
          if (effectiveStatus === "Late") counts.late += 1;
          return counts;
        },
        { total: 0, submitted: 0, pending: 0, late: 0 }
      ),
    [assignments]
  );

  const filteredAssignments = useMemo(
    () =>
      assignments.filter((assignment) => {
        const matchesSubject =
          subjectFilter === "All" ? true : assignment.subject === subjectFilter;
        const matchesSearch =
          assignment.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          assignment.subject.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSubject && matchesSearch;
      }),
    [assignments, subjectFilter, searchQuery]
  );

  useEffect(() => {
    const stored = window.localStorage.getItem("assignments");
    if (stored) {
      setAssignments(JSON.parse(stored));
    }
    const storedTheme = window.localStorage.getItem("theme");
    if (storedTheme === "dark") {
      setIsDarkMode(true);
      document.body.classList.add("theme-dark");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("assignments", JSON.stringify(assignments));
  }, [assignments]);

  useEffect(() => {
    window.localStorage.setItem("theme", isDarkMode ? "dark" : "light");
    document.body.classList.toggle("theme-dark", isDarkMode);
  }, [isDarkMode]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.subject.trim() || !form.dueDate) {
      return;
    }

    const newAssignment = {
      id: Date.now(),
      title: form.title.trim(),
      subject: form.subject.trim(),
      dueDate: form.dueDate,
      status: form.status,
    };

    setAssignments((previous) => [newAssignment, ...previous]);
    setForm({ title: "", subject: "", dueDate: "", status: "Pending" });
  };

  const updateStatus = (assignmentId, status) => {
    setAssignments((previous) =>
      previous.map((assignment) =>
        assignment.id === assignmentId ? { ...assignment, status } : assignment
      )
    );
  };

  return (
    <div className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">College dashboard</p>
          <h1>Assignment Submission Tracker</h1>
        </div>
        <div className="theme-controls">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setIsDarkMode((value) => !value)}
          >
            {isDarkMode ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </header>

      <section className="summary-row">
        <article className="summary-card summary-total">
          <span className="summary-label">Total</span>
          <strong>{summary.total}</strong>
        </article>
        <article className="summary-card summary-submitted">
          <span className="summary-label">Submitted</span>
          <strong>{summary.submitted}</strong>
        </article>
        <article className="summary-card summary-pending">
          <span className="summary-label">Pending</span>
          <strong>{summary.pending}</strong>
        </article>
        <article className="summary-card summary-late">
          <span className="summary-label">Late</span>
          <strong>{summary.late}</strong>
        </article>
      </section>

      <section className="form-panel">
        <form className="assignment-form" onSubmit={handleSubmit}>
          <h2>Add assignment</h2>
          <label>
            Title
            <input
              name="title"
              type="text"
              value={form.title}
              onChange={handleInputChange}
              placeholder="Enter assignment title"
            />
          </label>

          <label>
            Subject
            <input
              name="subject"
              type="text"
              value={form.subject}
              onChange={handleInputChange}
              placeholder="Enter subject name"
            />
          </label>

          <label>
            Due date
            <input
              name="dueDate"
              type="date"
              value={form.dueDate}
              onChange={handleInputChange}
            />
          </label>

          <label>
            Status
            <select
              name="status"
              value={form.status}
              onChange={handleInputChange}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <button type="submit">Add assignment</button>
        </form>

        <div className="filter-panel">
          <h2>Filter assignments</h2>
          <label>
            Search
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search title or subject"
            />
          </label>
          <label>
            Subject
            <select
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
            >
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </label>
          <p className="filter-note">
            Search and filter by subject to narrow assignments.
          </p>
        </div>
      </section>

      <section className="table-panel">
        <div className="table-head">
          <h2>Assignment list</h2>
          <span>{filteredAssignments.length} items</span>
        </div>

        {filteredAssignments.length === 0 ? (
          <div className="empty-state">No assignments to display.</div>
        ) : (
          <div className="assignment-list">
            <div className="assignment-row assignment-row-head">
              <span>Title</span>
              <span>Subject</span>
              <span>Due date</span>
              <span>Status</span>
            </div>
            {filteredAssignments.map((assignment) => (
              <div key={assignment.id} className="assignment-row">
                <span>{assignment.title}</span>
                <span>{assignment.subject}</span>
                <span>{assignment.dueDate}</span>
                <span>
                  <select
                    value={getEffectiveStatus(assignment)}
                    onChange={(event) =>
                      updateStatus(assignment.id, event.target.value)
                    }
                    className={`status-select status-${getEffectiveStatus(
                      assignment
                    ).toLowerCase()}`}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
