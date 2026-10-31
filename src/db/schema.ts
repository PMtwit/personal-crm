import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// How often the owner wants to talk to a contact; null on the contact means "not set"
export const touchIntervalEnum = pgEnum("touch_interval", [
  "week",
  "month",
  "quarter",
  "year",
]);

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    // Who this person is, in the owner's own words
    about: text("about"),
    howWeMet: text("how_we_met"),
    phone: text("phone"),
    email: text("email"),
    touchInterval: touchIntervalEnum("touch_interval"),
    // When the interval was set or changed: the countdown starts here
    // while the contact has no notes
    touchIntervalSetAt: timestamp("touch_interval_set_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("contacts_name_idx").on(table.name),
    check(
      "contacts_touch_interval_pair_check",
      sql`(${table.touchInterval} is null) = (${table.touchIntervalSetAt} is null)`,
    ),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notes_contact_id_created_at_idx").on(
      table.contactId,
      table.createdAt,
    ),
  ],
);

export type Contact = typeof contacts.$inferSelect;
export type Note = typeof notes.$inferSelect;
