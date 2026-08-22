/**
 * Id generation.
 *
 * A single module-level counter keeps ids unique within a session and
 * human-readable in the DOM (e.g. "n201", "e202").
 */

let nextId = 200;

/** Create the next unique id with the given prefix. */
export function CreateUniqueId(prefix: string): string {
  nextId += 1;
  return `${prefix}${nextId}`;
}
