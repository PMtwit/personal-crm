"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { deleteContactAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Deleting is permanent, so it always asks first.
// Cancel, Esc or a click outside closes the dialog and deletes nothing
export function DeleteContactButton({
  contactId,
  name,
}: {
  contactId: number;
  name: string;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="outline" className="text-destructive" />}
      >
        <Trash2 aria-hidden />
        Удалить
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Удалить «{name}»?</DialogTitle>
          <DialogDescription>
            Заметки о контакте тоже удалятся. Вернуть будет нельзя.
          </DialogDescription>
        </DialogHeader>
        <form action={deleteContactAction.bind(null, contactId)}>
          <ConfirmButtons />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmButtons() {
  const { pending } = useFormStatus();
  return (
    <DialogFooter>
      <DialogClose render={<Button variant="outline" />} disabled={pending}>
        Отмена
      </DialogClose>
      <Button type="submit" disabled={pending}>
        {pending ? "Удаляю…" : "Удалить"}
      </Button>
    </DialogFooter>
  );
}
