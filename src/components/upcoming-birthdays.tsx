import { BirthdaysList } from "@/components/birthdays-list";
import { todayInAppTimeZone, upcomingBirthdays } from "@/lib/birthdays";
import { listBirthdayContacts, listGroups } from "@/lib/data";
import {
  birthdayWhenText,
  formatBirthDate,
  turningAgeText,
} from "@/lib/format";
import { resolveSelectedGroup } from "@/lib/groups";
import { requireUserId } from "@/lib/session";

// "Birthday soon" on the home page: contacts whose birthday is today or in the
// next 7 days by Moscow's calendar, the nearest first. With a group chosen in
// the filter, only the people of this group. Hidden while the search box has
// a query, and when there is nobody to congratulate
export async function UpcomingBirthdays({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q, group: groupParam } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  if (query) {
    return null;
  }

  const userId = await requireUserId();
  const group = resolveSelectedGroup(groupParam, await listGroups(userId));
  const upcoming = upcomingBirthdays(
    await listBirthdayContacts(userId, group?.id ?? null),
    todayInAppTimeZone(),
  );
  if (upcoming.length === 0) {
    return null;
  }

  // Only texts go to the client component: it never needs dates
  return (
    <BirthdaysList
      // Another group is another list: "Show all" folds again
      key={group?.id ?? "all"}
      contacts={upcoming.map((contact) => ({
        id: contact.id,
        name: contact.name,
        // The real date, without the year: "29 февраля" even on the 28th
        dateLabel: formatBirthDate({
          day: contact.birthDay,
          month: contact.birthMonth,
          year: null,
        }),
        whenLabel: birthdayWhenText(contact.daysUntil),
        turningLabel:
          contact.turningAge === null
            ? null
            : turningAgeText(contact.turningAge),
      }))}
    />
  );
}
