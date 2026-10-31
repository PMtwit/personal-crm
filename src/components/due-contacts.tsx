import { DueContactsList } from "@/components/due-contacts-list";
import { listDueContacts } from "@/lib/data";
import { overdueText } from "@/lib/format";
import { touchIntervalLabels } from "@/lib/keep-in-touch";

// "Time to get in touch" on the home page: contacts whose due date has come.
// Hidden while the search box has a query, and when there is nobody to show
export async function DueContacts({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  if (query) {
    return null;
  }

  const due = await listDueContacts();
  if (due.length === 0) {
    return null;
  }

  // Only texts go to the client component: it never needs dates
  return (
    <DueContactsList
      contacts={due.map((contact) => ({
        id: contact.id,
        name: contact.name,
        intervalLabel: touchIntervalLabels[contact.touchInterval],
        overdueLabel: overdueText(contact.overdueDays),
      }))}
    />
  );
}
