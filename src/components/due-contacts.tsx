import { DueContactsList } from "@/components/due-contacts-list";
import { listDueContacts, listGroups } from "@/lib/data";
import { overdueText } from "@/lib/format";
import { resolveSelectedGroup } from "@/lib/groups";
import { touchIntervalLabels } from "@/lib/keep-in-touch";

// "Time to get in touch" on the home page: contacts whose due date has come.
// With a group chosen in the filter, only the people of this group.
// Hidden while the search box has a query, and when there is nobody to show
export async function DueContacts({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q, group: groupParam } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  if (query) {
    return null;
  }

  const group = resolveSelectedGroup(groupParam, await listGroups());
  const due = await listDueContacts(group?.id ?? null);
  if (due.length === 0) {
    return null;
  }

  // Only texts go to the client component: it never needs dates
  return (
    <DueContactsList
      // Another group is another list: "Show all" folds again
      key={group?.id ?? "all"}
      contacts={due.map((contact) => ({
        id: contact.id,
        name: contact.name,
        intervalLabel: touchIntervalLabels[contact.touchInterval],
        overdueLabel: overdueText(contact.overdueDays),
      }))}
    />
  );
}
