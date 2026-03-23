import test from "node:test";

globalThis.__TWOFA_AUTO_DISCOVERY_SENTINEL__ = true;

test("auto discovery sentinel file is loaded", () => {});
