// Reads the letters the app sent to Mailpit, the local mail catcher: tests
// log in through the link from the letter, as a person would.
// The letters of other tests live in Mailpit too, so a letter is looked up by
// its recipient and by the time it was sent

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

export type Letter = {
  id: string;
  createdAt: Date;
  from: { name: string; address: string };
  to: string[];
  subject: string;
  html: string;
  text: string;
};

async function mailpit<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Mailpit answered ${response.status} for ${path}`);
  }
  return (await response.json()) as T;
}

// All letters to the address, the newest first
export async function lettersTo(address: string): Promise<Letter[]> {
  const found = await mailpit<{
    messages: { ID: string; Created: string }[];
  }>(`/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
  return Promise.all(
    found.messages.map(async ({ ID, Created }) => {
      const message = await mailpit<{
        ID: string;
        From: { Name: string; Address: string };
        To: { Address: string }[];
        Subject: string;
        HTML: string;
        Text: string;
      }>(`/api/v1/message/${ID}`);
      return {
        id: message.ID,
        createdAt: new Date(Created),
        from: { name: message.From.Name, address: message.From.Address },
        to: message.To.map((recipient) => recipient.Address),
        subject: message.Subject,
        html: message.HTML,
        text: message.Text,
      };
    }),
  );
}

// The newest letter to the address that arrived after `since`; waits a little:
// the letter may be on its way
export async function waitForLetter(
  address: string,
  since: Date,
): Promise<Letter> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const [letter] = (await lettersTo(address)).filter(
      (candidate) => candidate.createdAt >= since,
    );
    if (letter) {
      return letter;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No letter to ${address} arrived in Mailpit`);
}

// The login link of the letter: the address of the "Войти" button
export function loginLink(letter: Letter): string {
  const match = /href="([^"]*\/api\/auth\/magic-link\/verify[^"]*)"/.exec(
    letter.html,
  );
  if (!match) {
    throw new Error("The letter has no login link");
  }
  return match[1].replaceAll("&amp;", "&");
}
