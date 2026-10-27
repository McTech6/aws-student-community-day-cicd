import type { Person, PersonId } from "./types";

type PeopleListProps = {
  readonly people: readonly Person[];
  readonly removingId: PersonId | null;
  readonly onRemove: (id: PersonId) => void;
};

export function PeopleList({ people, removingId, onRemove }: PeopleListProps) {
  return (
    <table className="people-table">
      <caption className="sr-only">People on the roster</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Email</th>
          <th scope="col">Role</th>
          <th scope="col">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {people.map((person) => (
          <tr key={person.id}>
            <td className="people-table__name">{person.name}</td>
            <td className="people-table__email">{person.email}</td>
            <td>
              <span className={`role-tag role-tag--${person.role}`}>
                {person.role}
              </span>
            </td>
            <td className="people-table__action">
              <button
                type="button"
                className="btn-ghost"
                disabled={removingId !== null}
                onClick={() => onRemove(person.id)}
              >
                {removingId === person.id ? "Removing…" : "Remove"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
