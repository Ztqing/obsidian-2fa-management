import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

await jiti.import("./base32.test.ts");
await jiti.import("./bulk-import.test.ts");
await jiti.import("./card-interactions.test.ts");
await jiti.import("./crypto.test.ts");
await jiti.import("./display.test.ts");
await jiti.import("./entry-order.test.ts");
await jiti.import("./i18n.test.ts");
await jiti.import("./otpauth.test.ts");
await jiti.import("./qr.test.ts");
await jiti.import("./totp-entry-import.test.ts");
await jiti.import("./totp.test.ts");
