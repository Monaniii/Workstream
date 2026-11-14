import type { Issue, IssueStatus } from "../services"

// A board column maps to a workflow status by position, then by the column's
// own key/name. Issues store the status key in `column_id`, but boards created
// from the project workflow use their status key while legacy/default boards
// may use other ids, so matching by index is the reliable fallback.
export function columnKeyFor(
  column: any,
  index: number,
  statuses: IssueStatus[]
) {
  const ordered = [...statuses].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  )
  const byPosition = ordered[index]
  if (byPosition) return { key: byPosition.key, statusId: byPosition.id }
  const byName = statuses.find(
    (s) =>
      s.key === String(column.id) ||
      s.name.toLowerCase() === String(column.name).toLowerCase()
  )
  if (byName) return { key: byName.key, statusId: byName.id }
  return { key: String(column.id), statusId: undefined }
}

/**
 * Place issues into the board's columns.
 *
 * Primary match is the issue's `column_id`; if that matches no column, fall
 * back to its workflow status key so a task is never silently invisible.
 */
export function groupIssuesByColumn(
  columns: any[],
  issues: Issue[],
  statuses: IssueStatus[]
) {
  const columnKeyOf = (c: any, index: number) =>
    columnKeyFor(c, index, statuses).key

  const perColumn = columns.map((c: any, index: number) => {
    const key = columnKeyOf(c, index)
    return {
      ...c,
      issues: issues.filter((i) => {
        if (String(i.column_id) === String(c.id)) return true
        if ((i.status_key || "") !== key) return false
        // Only fall back to the status key when `column_id` matches no column
        // at all, so an issue is never shown in two columns.
        return !columns.some((other) => String(other.id) === String(i.column_id))
      }),
    }
  })

  const knownColumnIds = new Set(columns.map((c) => String(c.id)))
  const knownStatusKeys = new Set(columns.map((c, index) => columnKeyOf(c, index)))
  const unassignedIssues = issues.filter(
    (i) =>
      !knownColumnIds.has(String(i.column_id)) &&
      !knownStatusKeys.has(String(i.status_key || ""))
  )

  return { issuesByColumn: perColumn, unassignedIssues }
}
