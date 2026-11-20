const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const sharp = require("sharp");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = path.join(DATA_DIR, "slide-review.db");
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");
const PORT = process.env.PORT || 3001;
const MAX_DIM = 1600; // downscale long edge to this many px
const JPEG_QUALITY = 85;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- DB setup ----------
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sort_order INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS labels (
    image_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    reviewed_by TEXT,
    reviewed_at TEXT NOT NULL,
    FOREIGN KEY (image_id) REFERENCES images(id)
  );
`);

const nextSortOrder = () => {
  const row = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM images").get();
  return row.m + 1;
};

// ---------- App setup ----------
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per original file, pre-compression
});

// List images (metadata only, no binary)
app.get("/api/images", (req, res) => {
  const rows = db
    .prepare("SELECT id, name, created_at FROM images ORDER BY sort_order ASC")
    .all();
  res.json(rows);
});

// Serve a single image's binary
app.get("/api/images/:id/file", (req, res) => {
  const row = db.prepare("SELECT filename FROM images WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).end();
  const filePath = path.join(UPLOAD_DIR, row.filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// Upload one or more images
app.post("/api/upload", upload.array("images", 200), async (req, res) => {
  const files = req.files || [];
  const created = [];
  const insertStmt = db.prepare(
    "INSERT INTO images (id, name, filename, created_at, sort_order) VALUES (?, ?, ?, ?, ?)"
  );

  for (const file of files) {
    if (!file.mimetype.startsWith("image/")) continue;
    try {
      const id = crypto.randomUUID();
      const filename = `${id}.jpg`;
      const outPath = path.join(UPLOAD_DIR, filename);

      await sharp(file.buffer)
        .rotate() // respect EXIF orientation
        .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toFile(outPath);

      const createdAt = new Date().toISOString();
      insertStmt.run(id, file.originalname, filename, createdAt, nextSortOrder());
      created.push({ id, name: file.originalname, created_at: createdAt });
    } catch (e) {
      console.error(`Failed to process ${file.originalname}:`, e.message);
    }
  }

  res.json({ created });
});

// Get all labels as a map: { [imageId]: { status, by, at } }
app.get("/api/labels", (req, res) => {
  const rows = db.prepare("SELECT image_id, status, reviewed_by, reviewed_at FROM labels").all();
  const map = {};
  for (const r of rows) {
    map[r.image_id] = { status: r.status, by: r.reviewed_by, at: r.reviewed_at };
  }
  res.json(map);
});

// Set/update a label
app.post("/api/labels/:id", (req, res) => {
  const { status, by } = req.body || {};
  if (!["pass", "fail"].includes(status)) {
    return res.status(400).json({ error: "status must be 'pass' or 'fail'" });
  }
  const imageExists = db.prepare("SELECT 1 FROM images WHERE id = ?").get(req.params.id);
  if (!imageExists) return res.status(404).json({ error: "image not found" });

  const at = new Date().toISOString();
  db.prepare(
    `INSERT INTO labels (image_id, status, reviewed_by, reviewed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(image_id) DO UPDATE SET status = excluded.status,
       reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at`
  ).run(req.params.id, status, by || "Unnamed reviewer", at);

  res.json({ status, by: by || "Unnamed reviewer", at });
});

// CSV export (server-side, so it always reflects the full DB)
app.get("/api/export.csv", (req, res) => {
  const rows = db
    .prepare(
      `SELECT i.name, l.status, l.reviewed_by, l.reviewed_at
       FROM images i LEFT JOIN labels l ON l.image_id = i.id
       ORDER BY i.sort_order ASC`
    )
    .all();

  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [["#", "filename", "status", "reviewed_by", "reviewed_at"]];
  rows.forEach((r, i) =>
    lines.push([i + 1, r.name, r.status || "pending", r.reviewed_by || "", r.reviewed_at || ""])
  );
  const csv = lines.map((row) => row.map(esc).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="slide-review.csv"`);
  res.send(csv);
});

// ---------- Serve built frontend (production) ----------
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).end();
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Slide review server running on http://localhost:${PORT}`);
});
