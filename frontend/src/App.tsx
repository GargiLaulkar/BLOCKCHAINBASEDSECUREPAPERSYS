import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AppShell } from "./shell/AppShell";
import { ComponentGallery } from "./gallery/ComponentGallery";
import { EmptyState, Button, Serial, StateStamp, LedgerTable, CustodyBubbles } from "@sigil/ui";

type ApiStatus = "checking" | "online" | "offline";
const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:4000";

function HomeView() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const { roles } = useAuth();

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
    <section className="welcome" aria-labelledby="welcome-title">
      <p className="eyebrow">Time-locked, threshold-controlled paper custody</p>
      <h1 id="welcome-title">SIGIL Custody Console</h1>
      <p className="intro">
        Examination question banks are split with Shamir secret sharing and released only inside an on-chain time window.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', margin: '24px 0' }}>
        <div style={{ background: 'var(--sigil-color-sheet)', border: '1px solid var(--sigil-color-hairline)', padding: '16px', borderRadius: '3px' }}>
          <h3 style={{ fontSize: '15px', margin: '0 0 6px 0' }}>Authority docket</h3>
          <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', margin: '0 0 12px 0' }}>
            Draft, schedule, run key ceremonies, and seal examinations.
          </p>
          <Link to="/authority/docket">
            <Button size="sm" variant="secondary">Open docket</Button>
          </Link>
        </div>

        <div style={{ background: 'var(--sigil-color-sheet)', border: '1px solid var(--sigil-color-hairline)', padding: '16px', borderRadius: '3px' }}>
          <h3 style={{ fontSize: '15px', margin: '0 0 6px 0' }}>Admin participants</h3>
          <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', margin: '0 0 12px 0' }}>
            Register and revoke authorized Authority, Setter, Holder, and Centre roles.
          </p>
          <Link to="/admin/participants">
            <Button size="sm" variant="secondary">Manage participants</Button>
          </Link>
        </div>

        <div style={{ background: 'var(--sigil-color-sheet)', border: '1px solid var(--sigil-color-hairline)', padding: '16px', borderRadius: '3px' }}>
          <h3 style={{ fontSize: '15px', margin: '0 0 6px 0' }}>Security design system</h3>
          <p style={{ fontSize: '13px', color: 'var(--sigil-color-slate)', margin: '0 0 12px 0' }}>
            Inspect security-paper tokens, Radix UI primitives, rosettes, and guard screens.
          </p>
          <Link to="/dev/gallery">
            <Button size="sm" variant="primary">Component gallery</Button>
          </Link>
        </div>
      </div>

      <div className="status-card" role="status" aria-live="polite">
        <span className={`status-dot ${apiStatus}`} aria-hidden="true" />
        <div>
          <strong>Backend API connection</strong>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--sigil-color-slate)' }}>
            {apiStatus === "checking" ? "Checking connection to ledger..." : apiStatus === "online" ? "Connected to Hardhat indexer" : "Offline / Unavailable"}
          </p>
        </div>
        {apiStatus === "offline" && <Button size="sm" variant="secondary" onClick={() => void checkApi()}>Retry</Button>}
      </div>
    </section>
  );
}

function AdminParticipantsPlaceholder() {
  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2>Participant Registry</h2>
          <p style={{ color: 'var(--sigil-color-slate)', margin: 0 }}>
            Manage authorized roles on the ExamVault smart contract.
          </p>
        </div>
      </div>
      <EmptyState
        title="Participant data layer pending (Member 5: FB-01)"
        description="The live participant hooks (useParticipants, registerParticipant, revokeParticipant) are part of FB-01 owned by Member 5. Interface requirements documented in docs/HANDOFF.md."
      />
    </div>
  );
}

function AuthorityDocketPlaceholder() {
  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2>Examination Docket</h2>
          <p style={{ color: 'var(--sigil-color-slate)', margin: 0 }}>
            Active and concluded examination custody records.
          </p>
        </div>
        <Button variant="primary">Create exam</Button>
      </div>
      <EmptyState
        title="Exam docket data layer pending (Member 5: FB-01)"
        description="The live exam subscription hooks (useExams, useExamDetail, createExam) are part of FB-01 owned by Member 5. Interface requirements documented in docs/HANDOFF.md."
      />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/dev/gallery"
            element={
              <AppShell requireAuth={false}>
                <ComponentGallery />
              </AppShell>
            }
          />
          <Route
            path="/admin/participants"
            element={
              <AppShell requireAuth={true} requiredRoles={["ADMIN"]}>
                <AdminParticipantsPlaceholder />
              </AppShell>
            }
          />
          <Route
            path="/authority/docket"
            element={
              <AppShell requireAuth={true} requiredRoles={["AUTHORITY"]}>
                <AuthorityDocketPlaceholder />
              </AppShell>
            }
          />
          <Route
            path="*"
            element={
              <AppShell requireAuth={false}>
                <HomeView />
              </AppShell>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
