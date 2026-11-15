import base from "../jest.config.mjs";

/** @type {import('jest').Config} */
export default {
  ...base,
  rootDir: "..",
  testRegex: "test/.*\\.e2e-spec\\.ts$",
  testTimeout: 30000,
  globalSetup: "<rootDir>/test/global-setup.mjs",
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};
