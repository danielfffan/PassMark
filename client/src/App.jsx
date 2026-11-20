import React, { useState, useEffect, useRef, useCallback } from "react";
import { Check, X, Upload, Download, ChevronLeft, ChevronRight, Loader2, ImageOff } from "lucide-react";

function StatusDot({ status }) {
  const color =
    status === "pass" ? "var(--pass)" : status === "fail" ? "var(--fail)" : "transparent";
  const border = status ? "none" : "1.5px solid var(--line-soft)";
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        border,
      }}
    />
  );
}

export default function App() {
  const [images, setImages] = useState([]); // [{id, name, created_at}]
  const [labels, setLabels] = useState({}); // id -> {status, by, at}
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const [apiError, setApiError] = useState(null);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [imgRes, lblRes] = await Promise.all([
        fetch("/api/images"),
        fetch("/api/labels"),
      ]);
      if (!imgRes.ok || !lblRes.ok) throw new Error("bad response");
      const imgs = await imgRes.json();
      const lbls = await lblRes.json();
      setImages(imgs);
      setLabels(lbls);
      const firstUnlabeled = imgs.findIndex((img) => !lbls[img.id]);
      setCurrent((prev) => (firstUnlabeled === -1 ? Math.min(prev, imgs.length - 1) : firstUnlabeled));
      setApiError(null);
    } catch (e) {
      setApiError("无法连接后端服务,请确认服务器已启动 (查看 README)。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpload = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;
      setUploading(true);
      setApiError(null);
      try {
        const form = new FormData();
        files.forEach((f) => form.append("images", f));
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (!res.ok) throw new Error("upload failed");
        await loadData();
        showToast(`已上传 ${files.length} 张图片`);
      } catch (e) {
        setApiError("上传失败,请检查网络连接或服务器状态。");
      } finally {
        setUploading(false);
      }
    },
    [loadData, showToast]
  );

  const setLabel = useCallback(
    async (id, status) => {
      // optimistic update
      const prevLabels = labels;
      const entry = { status, by: reviewer.trim() || "Unnamed reviewer", at: new Date().toISOString() };
      setLabels((l) => ({ ...l, [id]: entry }));
      try {
        const res = await fetch(`/api/labels/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, by: reviewer.trim() || "Unnamed reviewer" }),
        });
        if (!res.ok) throw new Error("save failed");
      } catch (e) {
        setLabels(prevLabels); // roll back
        setApiError("保存失败,该判定可能未保存,请检查网络连接。");
      }
    },
    [labels, reviewer]
  );

  const goTo = useCallback(
    (idx) => {
      if (idx < 0 || idx >= images.length) return;
      setCurrent(idx);
    },
    [images.length]
  );

  const advance = useCallback(() => {
    const nextUnlabeled = images.findIndex((img, i) => i > current && !labels[img.id]);
    if (nextUnlabeled !== -1) setCurrent(nextUnlabeled);
    else if (current < images.length - 1) setCurrent(current + 1);
  }, [images, labels, current]);

  useEffect(() => {
    function onKey(e) {
      if (images.length === 0) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") goTo(current - 1);
      else if (e.key === "ArrowRight") goTo(current + 1);
      else if (e.key.toLowerCase() === "p") {
        const img = images[current];
        if (img) {
          setLabel(img.id, "pass");
          advance();
        }
      } else if (e.key.toLowerCase() === "f") {
        const img = images[current];
        if (img) {
          setLabel(img.id, "fail");
          advance();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images, current, goTo, setLabel, advance]);

  const exportCsv = useCallback(() => {
    window.location.href = "/api/export.csv";
  }, []);

  const total = images.length;
  const reviewedCount = images.filter((img) => labels[img.id]).length;
  const currentImg = images[current];
  const currentLabel = currentImg ? labels[currentImg.id] : null;

  return (
    <div
      style={{
        "--bg": "#14161B",
        "--panel": "#1B1E25",
        "--panel-raised": "#22262F",
        "--line": "#2C303A",
        "--line-soft": "#383D48",
        "--text": "#E9EAED",
        "--text-muted": "#8D919C",
        "--text-faint": "#5C606B",
        "--pass": "#4FA87E",
        "--pass-dim": "#2E5C46",
        "--fail": "#D2694F",
        "--fail-dim": "#6B382A",
        "--accent": "#6FA8DC",
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        background: "var(--bg)",
        color: "var(--text)",
        minHeight: 640,
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--line)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: "1px solid var(--line)",
          background: "var(--panel)",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.12em",
              color: "var(--text-faint)",
              textTransform: "uppercase",
            }}
          >
            Slide Review
          </span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Pass / Fail Queue</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <input
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            placeholder="Your name"
            style={{
              background: "var(--panel-raised)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              color: "var(--text)",
              width: 130,
              outline: "none",
            }}
          />
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 13,
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {reviewedCount}/{total} reviewed
          </div>
          <button onClick={exportCsv} disabled={total === 0} style={secondaryBtnStyle(total === 0)}>
            <Download size={14} />
            Export CSV
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={primaryBtnStyle(uploading)}>
            {uploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
            {uploading ? "Uploading…" : "Upload images"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              handleUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {apiError && (
        <div style={{ background: "var(--fail-dim)", color: "#F4D9D0", fontSize: 12.5, padding: "8px 20px" }}>
          {apiError}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {loading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", gap: 8 }}>
            <Loader2 size={16} className="spin" /> Loading…
          </div>
        ) : total === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text-muted)" }}>
            <ImageOff size={28} color="var(--text-faint)" />
            <div style={{ fontSize: 14 }}>No images yet</div>
            <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Upload a batch to start reviewing.</div>
          </div>
        ) : (
          <>
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                background: "radial-gradient(circle at 50% 40%, #1E2129 0%, #14161B 75%)",
                padding: 24,
                minHeight: 360,
              }}
            >
              <button onClick={() => goTo(current - 1)} disabled={current === 0} style={navBtnStyle(current === 0, "left")} aria-label="Previous image">
                <ChevronLeft size={20} />
              </button>

              <div style={{ maxWidth: "80%", maxHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                {currentImg ? (
                  <img
                    src={`/api/images/${currentImg.id}/file`}
                    alt={currentImg.name}
                    style={{
                      maxWidth: "100%",
                      maxHeight: 440,
                      borderRadius: 4,
                      border: `2px solid ${
                        currentLabel?.status === "pass" ? "var(--pass)" : currentLabel?.status === "fail" ? "var(--fail)" : "var(--line)"
                      }`,
                      boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
                      background: "#000",
                    }}
                  />
                ) : null}
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "var(--text-faint)", textAlign: "center" }}>
                  {currentImg?.name} · {current + 1} of {total}
                  {currentLabel && (
                    <span style={{ color: "var(--text-muted)" }}> · marked {currentLabel.status} by {currentLabel.by}</span>
                  )}
                </div>
              </div>

              <button onClick={() => goTo(current + 1)} disabled={current === total - 1} style={navBtnStyle(current === total - 1, "right")} aria-label="Next image">
                <ChevronRight size={20} />
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 14, padding: "18px 20px", borderTop: "1px solid var(--line)", background: "var(--panel)" }}>
              <button onClick={() => { setLabel(currentImg.id, "fail"); advance(); }} style={decisionBtnStyle("fail", currentLabel?.status === "fail")}>
                <X size={16} /> Fail <kbd style={kbdStyle}>F</kbd>
              </button>
              <button onClick={() => { setLabel(currentImg.id, "pass"); advance(); }} style={decisionBtnStyle("pass", currentLabel?.status === "pass")}>
                <Check size={16} /> Pass <kbd style={kbdStyle}>P</kbd>
              </button>
            </div>

            <div style={{ borderTop: "1px solid var(--line)", background: "#101216", padding: "10px 14px 12px" }}>
              <div style={{ display: "flex", gap: 2, marginBottom: 6, paddingLeft: 2 }}>
                {images.map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 3, background: "#23262d" }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {images.map((img, i) => {
                  const lbl = labels[img.id];
                  const active = i === current;
                  return (
                    <button
                      key={img.id}
                      onClick={() => goTo(i)}
                      title={img.name}
                      style={{
                        flexShrink: 0,
                        width: 58,
                        height: 58,
                        borderRadius: 4,
                        border: active ? "2px solid var(--accent)" : "1px solid var(--line)",
                        padding: 0,
                        cursor: "pointer",
                        position: "relative",
                        overflow: "hidden",
                        background: "#000",
                        opacity: lbl ? 1 : 0.75,
                      }}
                    >
                      <img src={`/api/images/${img.id}/file`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", top: 3, right: 3 }}>
                        <StatusDot status={lbl?.status} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--panel-raised)",
            border: "1px solid var(--line-soft)",
            color: "var(--text)",
            fontSize: 12.5,
            padding: "8px 14px",
            borderRadius: 6,
          }}
        >
          {toast}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        ::-webkit-scrollbar { height: 6px; }
        ::-webkit-scrollbar-thumb { background: #2C303A; border-radius: 4px; }
      `}</style>
    </div>
  );
}

function navBtnStyle(disabled, side) {
  return {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    background: "var(--panel-raised)",
    border: "1px solid var(--line)",
    color: disabled ? "var(--text-faint)" : "var(--text)",
    borderRadius: "50%",
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    zIndex: 2,
    [side]: 10,
  };
}

function decisionBtnStyle(kind, active) {
  const color = kind === "pass" ? "var(--pass)" : "var(--fail)";
  const dim = kind === "pass" ? "var(--pass-dim)" : "var(--fail-dim)";
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 22px",
    borderRadius: 8,
    border: `1.5px solid ${active ? color : "var(--line-soft)"}`,
    background: active ? dim : "var(--panel-raised)",
    color: active ? color : "var(--text)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function primaryBtnStyle(disabled) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "var(--accent)",
    color: "#101319",
    border: "none",
    borderRadius: 6,
    padding: "7px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function secondaryBtnStyle(disabled) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "var(--panel-raised)",
    color: disabled ? "var(--text-faint)" : "var(--text)",
    border: "1px solid var(--line-soft)",
    borderRadius: 6,
    padding: "7px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

const kbdStyle = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 10,
  color: "var(--text-faint)",
  border: "1px solid var(--line-soft)",
  borderRadius: 3,
  padding: "1px 4px",
  marginLeft: 2,
};
