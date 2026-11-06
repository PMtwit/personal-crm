import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

// Opening a login link and prolonging the session go through here
export const { GET, POST } = toNextJsHandler(auth);
