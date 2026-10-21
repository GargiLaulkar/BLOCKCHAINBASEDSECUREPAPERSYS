import { useEffect, useState } from "react";

type ApiStatus = "checking" | "online" | "offline";

const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:4000";

export function App() {
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
        <a className="brand" href="/" aria-label="SIGIL home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SIGIL</span>
        </a>
        <span className="environment">LOCAL DEMO</span>
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
