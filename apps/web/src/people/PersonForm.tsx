import { useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ApiError } from "./peopleApi";
import {
  findDraftErrors,
  isDuplicateEmail,
  isPersonRole,
  type DraftErrors,
  type Person,
  type PersonDraft,
  type PersonRole,
} from "./types";

const SAVE_FAIL = "Could not save that person. Try again.";

type PersonFormProps = {
  readonly people: readonly Person[];
  readonly onAdd: (draft: PersonDraft) => Promise<void>;
};

type SubmitState =
  | { readonly status: "idle" }
  | { readonly status: "saving" }
  | { readonly status: "failed"; readonly messages: readonly string[] };

export function PersonForm({ people, onAdd }: PersonFormProps) {
  const nameId = useId();
  const emailId = useId();
  const roleId = useId();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PersonRole>("intern");
  const [errors, setErrors] = useState<DraftErrors>({});
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  /** State updates wait for the next render; a fast double click needs a lock that flips now. */
  const inFlight = useRef(false);

  const saving = submit.status === "saving";

  const duplicateHint =
    email.trim() !== "" && isDuplicateEmail(people, email)
      ? "That email is already on the roster."
      : null;

  function handleRoleChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    if (isPersonRole(value)) {
      setRole(value);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) {
      return;
    }

    const draft: PersonDraft = { name, email, role };
    const draftErrors = findDraftErrors(draft);
    setErrors(draftErrors);
    if (Object.keys(draftErrors).length > 0) {
      setSubmit({ status: "idle" });
      return;
    }

    inFlight.current = true;
    setSubmit({ status: "saving" });
    try {
      await onAdd(draft);
      setName("");
      setEmail("");
      setRole("intern");
      setSubmit({ status: "idle" });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setErrors({ email: error.message });
        setSubmit({ status: "idle" });
        return;
      }
      const messages =
        error instanceof ApiError ? error.messages : [SAVE_FAIL];
      setSubmit({ status: "failed", messages });
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <form
      className="person-form"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      aria-busy={saving}
    >
      <header className="person-form__head">
        <h2>Add person</h2>
        <p>Use fake emails ending in @forge.test</p>
      </header>

      <div className="field">
        <label htmlFor={nameId}>Name</label>
        <input
          id={nameId}
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Tidding Ramsey Binda"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(errors.name)}
        />
        {errors.name ? <p className="field-error">{errors.name}</p> : null}
      </div>

      <div className="field">
        <label htmlFor={emailId}>Email</label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="ramsey@forge.test"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(errors.email) || Boolean(duplicateHint)}
        />
        {duplicateHint && !errors.email ? (
          <p className="field-hint" role="status">
            {duplicateHint}
          </p>
        ) : null}
        {errors.email ? <p className="field-error">{errors.email}</p> : null}
      </div>

      <div className="field">
        <label htmlFor={roleId}>Role</label>
        <select id={roleId} name="role" value={role} onChange={handleRoleChange}>
          <option value="intern">Intern</option>
          <option value="core">Core</option>
        </select>
      </div>

      {submit.status === "failed" ? (
        <div role="alert">
          {submit.messages.map((message) => (
            <p key={message} className="field-error">
              {message}
            </p>
          ))}
        </div>
      ) : null}

      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? "Saving…" : "Add to roster"}
      </button>
    </form>
  );
}
