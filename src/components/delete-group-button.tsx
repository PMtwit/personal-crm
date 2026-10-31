"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { deleteGroupAction } from "@/app/actions";
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

// Deleting a group is permanent, so it always asks first. The contacts stay:
// they only leave the group. Cancel, Esc or a click outside closes the dialog
// and deletes nothing
export function DeleteGroupButton({
  groupId,
  name,
}: {
  groupId: number;
  name: string;
}) {
  return (
    <Dialog>
      {/* On phones only the icon; the name for screen readers says which group */}
      <DialogTrigger
        render={
          <Button
            variant="outline"
            aria-label={`Удалить «${name}»`}
            className="text-destructive max-sm:size-11 max-sm:px-0"
          />
        }
      >
        <Trash2 aria-hidden />
        <span className="max-sm:hidden">Удалить</span>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Удалить группу «{name}»?</DialogTitle>
          <DialogDescription>
            Контакты останутся, они только выйдут из группы. Вернуть группу
            будет нельзя.
          </DialogDescription>
        </DialogHeader>
        <form action={deleteGroupAction.bind(null, groupId)}>
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
