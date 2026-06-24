import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const dataPath = join(__dirname, "data.json");
const distPath = join(rootDir, "dist");
const indexPath = join(distPath, "index.html");
const port = Number(process.env.PORT || 4000);
const assignmentStatuses = new Set(["Pending", "Submitted", "Late"]);
const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function readStore() {
  const content = await readFile(dataPath, "utf8");
  const store = JSON.parse(content);

  return {
    ...store,
    assignments: store.assignments.map(normalizeAssignment),
  };
}

async function writeStore(store) {
  await writeFile(dataPath, `${JSON.stringify(store, null, 2)}\n`);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(payload));
}

function sendNoContent(response) {
  response.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end();
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain",
  });
  response.end(payload);
}

async function sendFile(response, filePath) {
  const content = await readFile(filePath);
  const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";

  response.writeHead(200, {
    "Content-Type": contentType,
  });
  response.end(content);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function getRoute(request) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  return {
    method: request.method,
    resource: parts[1],
    id: parts[2] ? Number(parts[2]) : null,
    isApi: parts[0] === "api",
  };
}

function toStudent(payload) {
  const name = String(payload.name || "").trim();
  const course = String(payload.course || "").trim();
  const attendance = Number(payload.attendance);

  if (!name || !course || Number.isNaN(attendance)) {
    return null;
  }

  return {
    name,
    course,
    attendance: Math.max(0, Math.min(100, Math.round(attendance))),
  };
}

function toAssignment(payload) {
  const title = String(payload.title || "").trim();
  const subject = String(payload.subject || payload.course || "").trim();
  const dueDate = String(payload.dueDate || "No due date").trim();
  const status = assignmentStatuses.has(payload.status) ? payload.status : "Pending";

  if (!title || !subject) {
    return null;
  }

  return { title, subject, dueDate, status };
}

function normalizeAssignment(assignment) {
  const status = assignmentStatuses.has(assignment.status)
    ? assignment.status
    : "Pending";

  return {
    id: assignment.id,
    title: assignment.title,
    subject: assignment.subject || assignment.course || "",
    dueDate: assignment.dueDate || "No due date",
    status,
  };
}

function nextId(records) {
  return records.length === 0 ? 1 : Math.max(...records.map((record) => record.id)) + 1;
}

function updateById(records, id, changes) {
  let updatedRecord = null;
  const updatedRecords = records.map((record) => {
    if (record.id !== id) {
      return record;
    }

    updatedRecord = { ...record, ...changes };
    return updatedRecord;
  });

  return { updatedRecord, updatedRecords };
}

async function handleStudents(route, request, response) {
  const store = await readStore();

  if (route.method === "GET" && route.id === null) {
    sendJson(response, 200, store.students);
    return;
  }

  if (route.method === "POST" && route.id === null) {
    const student = toStudent(await readJsonBody(request));

    if (!student) {
      sendJson(response, 400, { message: "Name, course, and attendance are required." });
      return;
    }

    const createdStudent = { id: nextId(store.students), ...student };
    store.students.push(createdStudent);
    await writeStore(store);
    sendJson(response, 201, createdStudent);
    return;
  }

  if (route.method === "PATCH" && route.id !== null) {
    const payload = await readJsonBody(request);
    const changes = {};

    if (payload.name !== undefined) {
      changes.name = String(payload.name).trim();

      if (!changes.name) {
        sendJson(response, 400, { message: "Student name cannot be empty." });
        return;
      }
    }

    if (payload.course !== undefined) {
      changes.course = String(payload.course).trim();

      if (!changes.course) {
        sendJson(response, 400, { message: "Student course cannot be empty." });
        return;
      }
    }

    if (payload.attendance !== undefined) {
      const attendance = Number(payload.attendance);

      if (Number.isNaN(attendance)) {
        sendJson(response, 400, { message: "Attendance must be a number." });
        return;
      }

      changes.attendance = Math.max(0, Math.min(100, Math.round(attendance)));
    }

    const { updatedRecord, updatedRecords } = updateById(
      store.students,
      route.id,
      changes,
    );

    if (!updatedRecord) {
      sendJson(response, 404, { message: "Student not found." });
      return;
    }

    store.students = updatedRecords;
    await writeStore(store);
    sendJson(response, 200, updatedRecord);
    return;
  }

  if (route.method === "DELETE" && route.id !== null) {
    const originalLength = store.students.length;
    store.students = store.students.filter((student) => student.id !== route.id);

    if (store.students.length === originalLength) {
      sendJson(response, 404, { message: "Student not found." });
      return;
    }

    await writeStore(store);
    sendNoContent(response);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed." });
}

async function handleAssignments(route, request, response) {
  const store = await readStore();

  if (route.method === "GET" && route.id === null) {
    sendJson(response, 200, store.assignments);
    return;
  }

  if (route.method === "POST" && route.id === null) {
    const assignment = toAssignment(await readJsonBody(request));

    if (!assignment) {
      sendJson(response, 400, { message: "Title and subject are required." });
      return;
    }

    const createdAssignment = { id: nextId(store.assignments), ...assignment };
    store.assignments.push(createdAssignment);
    await writeStore(store);
    sendJson(response, 201, createdAssignment);
    return;
  }

  if (route.method === "PATCH" && route.id !== null) {
    const payload = await readJsonBody(request);
    const changes = {};

    if (payload.title !== undefined) {
      changes.title = String(payload.title).trim();

      if (!changes.title) {
        sendJson(response, 400, { message: "Assignment title cannot be empty." });
        return;
      }
    }

    if (payload.subject !== undefined || payload.course !== undefined) {
      changes.subject = String(payload.subject || payload.course).trim();

      if (!changes.subject) {
        sendJson(response, 400, { message: "Assignment subject cannot be empty." });
        return;
      }
    }

    if (payload.dueDate !== undefined) {
      changes.dueDate = String(payload.dueDate).trim() || "No due date";
    }

    if (payload.status !== undefined) {
      if (!assignmentStatuses.has(payload.status)) {
        sendJson(response, 400, { message: "Invalid assignment status." });
        return;
      }

      changes.status = payload.status;
    }

    const { updatedRecord, updatedRecords } = updateById(
      store.assignments,
      route.id,
      changes,
    );

    if (!updatedRecord) {
      sendJson(response, 404, { message: "Assignment not found." });
      return;
    }

    store.assignments = updatedRecords;
    await writeStore(store);
    sendJson(response, 200, updatedRecord);
    return;
  }

  if (route.method === "DELETE" && route.id !== null) {
    const originalLength = store.assignments.length;
    store.assignments = store.assignments.filter(
      (assignment) => assignment.id !== route.id,
    );

    if (store.assignments.length === originalLength) {
      sendJson(response, 404, { message: "Assignment not found." });
      return;
    }

    await writeStore(store);
    sendNoContent(response);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed." });
}

async function handleStatic(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed.");
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = normalize(join(distPath, requestedPath));

  if (!filePath.startsWith(distPath)) {
    sendText(response, 403, "Forbidden.");
    return;
  }

  try {
    const fileStats = await stat(filePath);

    if (fileStats.isFile()) {
      await sendFile(response, filePath);
      return;
    }
  } catch {
    // Fall back to index.html for client-side routes.
  }

  try {
    await sendFile(response, indexPath);
  } catch {
    sendText(
      response,
      404,
      "Frontend build not found. Run npm.cmd run build before hosting.",
    );
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      sendNoContent(response);
      return;
    }

    const route = getRoute(request);

    if (!route.isApi) {
      await handleStatic(request, response);
      return;
    }

    if (route.resource === "health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (route.resource === "students") {
      await handleStudents(route, request, response);
      return;
    }

    if (route.resource === "assignments") {
      await handleAssignments(route, request, response);
      return;
    }

    sendJson(response, 404, { message: "API route not found." });
  } catch (error) {
    sendJson(response, 500, {
      message: "Server error.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, () => {
  console.log(`App server running at http://localhost:${port}`);
});
