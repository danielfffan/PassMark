# PassMark— Pass/Fail Labeling Tool

Images are stored on the local file system (compressed automatically on upload), and label data is stored in SQLite. The frontend and backend are separate; in production, Express serves the built frontend as static files, so everything runs on a single port.

## Directory Structure

```
slide-review-app/
├── server/           Express + SQLite + image upload/compression
│   ├── index.js
│   ├── package.json
│   └── data/          Database file + uploaded images (created automatically on first run)
├── client/           React (Vite) frontend
│   ├── src/App.jsx
│   └── package.json
├── Dockerfile
└── docker-compose.yml
```

---

## Option 1: Run Directly on a Local Machine / Server (without Docker)

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Development mode (local debugging)

```bash
# Terminal 1: start the backend (listens on 3001)
cd server && npm run dev

# Terminal 2: start the frontend dev server (listens on 5173, proxies /api to 3001)
cd client && npm run dev
```

Open `http://localhost:5173` in your browser.

### 3. Production deployment

```bash
# Build the frontend
cd client && npm run build     # outputs to client/dist

# Start the backend (serves client/dist automatically on a single port)
cd ../server && npm start      # listens on 3001 by default; change with PORT=8080 npm start
```

Visit `http://<your-server-IP>:3001`.

### 4. Keep the process running (pm2 recommended)

```bash
npm install -g pm2
cd server
pm2 start index.js --name slide-review
pm2 save
pm2 startup   # follow the prompt to enable start on boot
```

### 5. Nginx reverse proxy + domain + HTTPS (optional but recommended)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    client_max_body_size 50m;   # allow larger image uploads
}
```

Then run `certbot --nginx` to set up HTTPS in one step.

---

## Option 2: Use Docker (recommended, no Node.js installation needed)

```bash
docker compose up -d --build
```

Visit `http://<your-server-IP>:3001`. Data (database + images) is persisted in the Docker volume `slide-review-data`, so restarting the container won't lose any data.

To upgrade / redeploy:

```bash
git pull
docker compose up -d --build
```

---

## Where the Data Lives

- Image files: `server/data/uploads/*.jpg` (compressed on upload so the longest side is ≤1600px)
- Labels + metadata: `server/data/slide-review.db` (SQLite, a single file that's easy to back up)

**To back up, just archive the entire `server/data/` directory.**

## API Reference

| Method | Path | Description |
|---|---|---|
| GET  | `/api/images` | List images (metadata only, no binary data) |
| GET  | `/api/images/:id/file` | Get a single image |
| POST | `/api/upload` | Upload images (multipart, field name `images`, multiple allowed) |
| GET  | `/api/labels` | All labels, as `{ imageId: {status, by, at} }` |
| POST | `/api/labels/:id` | Set the label for an image; body: `{status: "pass"\|"fail", by}` |
| GET  | `/api/export.csv` | Export as CSV (generated server-side, always reflects the latest database state) |

## Possible Extensions

- Move image storage to S3 / OSS (change the `sharp(...).toFile()` part of `server/index.js` to write to object storage, and keep only the URL in the database)
- Add login / access control (currently anyone who can reach the address can upload and label)
- Switch to PostgreSQL (for large datasets or multi-instance deployments; replace
