ALTER TABLE "contacts" ADD COLUMN "birth_day" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_month" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_year" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birth_day_month_pair_check" CHECK (("contacts"."birth_day" is null) = ("contacts"."birth_month" is null));--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birth_year_needs_date_check" CHECK ("contacts"."birth_year" is null or ("contacts"."birth_day" is not null and "contacts"."birth_month" is not null));--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birth_date_check" CHECK ("contacts"."birth_month" is null or (
        "contacts"."birth_month" between 1 and 12
        and "contacts"."birth_day" between 1 and (case "contacts"."birth_month" when 2 then 29 when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30 else 31 end)
        and ("contacts"."birth_year" is null or (
          "contacts"."birth_year" >= 1900
          and ("contacts"."birth_month" <> 2 or "contacts"."birth_day" <> 29
            or ("contacts"."birth_year" % 4 = 0 and ("contacts"."birth_year" % 100 <> 0 or "contacts"."birth_year" % 400 = 0)))
        ))
      ));