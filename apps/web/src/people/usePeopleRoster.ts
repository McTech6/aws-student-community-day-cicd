import { useCallback, useEffect, useState } from "react";
import { ApiError, createPerson, deletePerson, fetchPeople } from "./peopleApi";
import {
  errorMessage,
  type LoadState,
  type Person,
  type PersonDraft,
  type PersonId,
} from "./types";

const LOAD_FAIL = "Something went wrong loading people.";

export function usePeopleRoster() {
  const [people, setPeople] = useState<readonly Person[]>([]);
  const [load, setLoad] = useState<LoadState>({ status: "idle" });

  const reload = useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const rows = await fetchPeople();
      setPeople(rows);
      setLoad({ status: "ready" });
    } catch (error) {
      setLoad({
        status: "error",
        message: errorMessage(error, LOAD_FAIL),
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoad({ status: "loading" });
      try {
        const rows = await fetchPeople();
        if (!cancelled) {
          setPeople(rows);
          setLoad({ status: "ready" });
        }
      } catch (error) {
        if (!cancelled) {
          setLoad({
            status: "error",
            message: errorMessage(error, LOAD_FAIL),
          });
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function addPerson(draft: PersonDraft): Promise<void> {
    const saved = await createPerson(draft);
    setPeople((current) => [...current, saved]);
  }

  async function removePerson(id: PersonId): Promise<void> {
    try {
      await deletePerson(id);
    } catch (error) {
      const alreadyGone = error instanceof ApiError && error.status === 404;
      if (!alreadyGone) {
        throw error;
      }
    }
    setPeople((current) => current.filter((row) => row.id !== id));
  }

  return {
    people,
    load,
    reload,
    addPerson,
    removePerson,
  } as const;
}
