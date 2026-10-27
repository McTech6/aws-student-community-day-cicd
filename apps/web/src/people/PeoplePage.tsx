import { useRef, useState } from "react";
import { PeopleEmpty } from "./PeopleEmpty";
import { PeopleList } from "./PeopleList";
import { PersonForm } from "./PersonForm";
import {
  errorMessage,
  formatPersonCount,
  type LoadState,
  type PersonId,
} from "./types";
import { usePeopleRoster } from "./usePeopleRoster";
import "./people.css";

const REMOVE_FAIL = "Something went wrong removing that person.";

function LoadPanel({ load }: { readonly load: LoadState }) {
  switch (load.status) {
    case "idle":
      return null;
    case "loading":
      return (
        <div className="people-banner people-banner--loading" role="status">
          Loading roster…
        </div>
      );
    case "error":
      return null;
    case "ready":
      return null;
    default: {
      const _exhaustive: never = load;
      return _exhaustive;
    }
  }
}

export function PeoplePage() {
  const { people, load, reload, addPerson, removePerson } = usePeopleRoster();
  const formAnchorRef = useRef<HTMLDivElement>(null);
  const [removingId, setRemovingId] = useState<PersonId | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function handleRemove(id: PersonId) {
    setRemovingId(id);
    setRemoveError(null);
    try {
      await removePerson(id);
    } catch (error) {
      setRemoveError(errorMessage(error, REMOVE_FAIL));
    } finally {
      setRemovingId(null);
    }
  }

  function focusForm() {
    formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    formAnchorRef.current?.querySelector("input")?.focus();
  }

  return (
    <section className="people-page">
      <header className="people-hero">
        <div>
          <p className="people-hero__eyebrow">Forge / People</p>
          <h1>Roster</h1>
        </div>
      </header>

      <LoadPanel load={load} />

      {load.status === "error" ? (
        <div className="people-banner people-banner--error" role="alert">
          <div>
            <strong>Could not load people</strong>
            <p>{load.message}</p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void reload()}
          >
            Retry
          </button>
        </div>
      ) : null}

      {load.status === "ready" ? (
        <div className="people-layout">
          <div className="people-layout__list">
            <div className="panel-head">
              <h2>On the board</h2>
              <p className="panel-count">{formatPersonCount(people.length)}</p>
            </div>

            {removeError ? (
              <div className="people-banner people-banner--error" role="alert">
                <div>
                  <strong>Could not remove person</strong>
                  <p>{removeError}</p>
                </div>
              </div>
            ) : null}

            {people.length === 0 ? (
              <PeopleEmpty onFocusForm={focusForm} />
            ) : (
              <PeopleList
                people={people}
                removingId={removingId}
                onRemove={(id) => void handleRemove(id)}
              />
            )}
          </div>

          <div className="people-layout__form" ref={formAnchorRef}>
            <PersonForm people={people} onAdd={addPerson} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
