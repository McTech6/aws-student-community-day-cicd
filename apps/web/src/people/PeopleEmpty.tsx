type PeopleEmptyProps = {
  readonly onFocusForm?: () => void;
};

export function PeopleEmpty({ onFocusForm }: PeopleEmptyProps) {
  return (
    <div className="people-empty">
      <p className="people-empty__title">No one on the roster yet</p>
      <p className="people-empty__copy">
        Add the first person with the form. They are saved in Neon, so they
        stay after a refresh.
      </p>
      {onFocusForm ? (
        <button type="button" className="btn-secondary" onClick={onFocusForm}>
          Jump to form
        </button>
      ) : null}
    </div>
  );
}
