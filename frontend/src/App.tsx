import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { ComponentGallery } from "./gallery/ComponentGallery";

type ApiStatus = "checking" | "online" | "offline";

const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:4000";

function HomeView() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  async function checkApi() {
    setApiStatus("checking");
    try {
      const response = await fetch(`${apiOrigin}/api/health`);
      setApiStatus(response.ok ? "online" : "offline");
    } catch {
      setApiStatus("offline");
    }
  }

  useEffect(() => {
    void checkApi();
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="SIGIL home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SIGIL</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link
            to="/dev/gallery"
            style={{
              fontSize: '13px',
              color: 'var(--sigil-color-ink)',
              textDecoration: 'none',
              fontWeight: 600,
              border: '1px solid var(--sigil-color-hairline)',
              padding: '4px 10px',
              borderRadius: '3px',
              background: 'var(--sigil-color-sheet)'
            }}
          >
            Component gallery (/dev/gallery)
          </Link>
          <span className="environment">LOCAL DEMO</span>
        </div>
      </header>
      <section className="welcome" aria-labelledby="welcome-title">
        <p className="eyebrow">Secure examination custody</p>
        <h1 id="welcome-title">Welcome to SIGIL</h1>
        <p className="intro">
          Exam records and participant activity will appear here after they are created through the application.
        </p>
        <div className="status-card" role="status" aria-live="polite">
          <span className={`status-dot ${apiStatus}`} aria-hidden="true" />
          <div>
            <strong>Backend API</strong>
            <p>{apiStatus === "checking" ? "Checking connection..." : apiStatus === "online" ? "Connected" : "Unavailable"}</p>
          </div>
          {apiStatus === "offline" && <button onClick={() => void checkApi()}>Retry</button>}
        </div>
      </section>
      <footer>Local development environment · No examination data is preloaded</footer>
    </main>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/dev/gallery" element={<ComponentGallery />} />
        <Route path="*" element={<HomeView />} />
      </Routes>
    </BrowserRouter>
  );
}
