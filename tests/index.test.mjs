import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

await jiti.import("./base32.test.ts");
await jiti.import("./bulk-otpauth-import-state.test.ts");
await jiti.import("./bulk-import.test.ts");
await jiti.import("./card-interactions.test.ts");
await jiti.import("./code-transition.test.ts");
await jiti.import("./crypto.test.ts");
await jiti.import("./display.test.ts");
await jiti.import("./entry-order.test.ts");
await jiti.import("./i18n.test.ts");
await jiti.import("./otpauth.test.ts");
await jiti.import("./provider-icons.test.ts");
await jiti.import("./qr.test.ts");
await jiti.import("./plugin-actions.test.ts");
await jiti.import("./totp-manager-view-code-refresh.test.ts");
await jiti.import("./totp-manager-view-controller.test.ts");
await jiti.import("./totp-manager-view-renderer.test.ts");
await jiti.import("./totp-manager-view-state.test.ts");
await jiti.import("./totp-entry-modal-controller.test.ts");
await jiti.import("./totp-entry-import.test.ts");
await jiti.import("./totp.test.ts");
await jiti.import("./vault-service.test.ts");
