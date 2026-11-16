import { z } from "zod";

// Before its first check zod calls new Function("") to see whether it may
// speed itself up with eval. The app's CSP forbids eval, so in the browser
// that probe is blocked and reported as a CSP violation, though zod gets on
// without it. jitless skips the probe. Import z from here, not from "zod":
// then the setting is always made before any schema runs
z.config({ jitless: true });

export { z };
