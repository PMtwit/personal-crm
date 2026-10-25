import { createCn } from "cn/config";

// cn() has to know the font sizes and radii added in globals.css: otherwise it
// takes `text-title` for a color and drops `text-muted-foreground`, or keeps
// both `rounded-lg` and `rounded-card`
export const cn = createCn({
  extend: {
    theme: {
      text: [
        "title",
        "title-lg",
        "button",
        "button-lg",
        "logo",
        "logo-lg",
        "logo-mark",
        "logo-mark-lg",
        "avatar",
        "avatar-lg",
      ],
      radius: [
        "block",
        "block-lg",
        "card",
        "card-lg",
        "note",
        "note-lg",
        "avatar",
        "avatar-lg",
        "button",
        "logo",
        "logo-lg",
      ],
    },
  },
});
