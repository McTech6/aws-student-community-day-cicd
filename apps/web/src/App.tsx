import { useState } from "react";
import { PeoplePage } from "./people/PeoplePage";

type View = "home" | "people";

export default function App() {
  const [view, setView] = useState<View>("people");

  return (
    <div className="app-shell">
      <header className="app-top">
        <div className="app-brand">
          <p className="app-brand__mark">Forge</p>
          <p className="app-brand__sub">REZA Path</p>
        </div>
        <nav className="app-nav" aria-label="Primary">
          <button
            type="button"
            className={view === "home" ? "is-active" : undefined}
            aria-current={view === "home" ? "page" : undefined}
            onClick={() => setView("home")}
          >
            Home
          </button>
          <button
            type="button"
            className={view === "people" ? "is-active" : undefined}
            aria-current={view === "people" ? "page" : undefined}
            onClick={() => setView("people")}
          >
            People
          </button>
        </nav>
      </header>

      {view === "home" ? (
        <section className="home-panel">
          <h1>Studio board</h1>
          <p className="lede">
            Fake studio data for real practice: people, then API, then database.
          </p>
          <p>
            The People page is <strong>React</strong> talking to a{" "}
            <strong>NestJS</strong> API and a <strong>PostgreSQL</strong>{" "}
            database. Every change reaches AWS through a CI/CD pipeline.
          </p>
          <div className="home-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => setView("people")}
            >
              Open People
            </button>
          </div>
        </section>
      ) : (
        <PeoplePage />
      )}
    </div>
  );
}
