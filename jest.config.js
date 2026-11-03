module.exports = {
  roots: ["<rootDir>/sandbox"],
  testMatch: ["**/tests/*.test.js"],
  transform: { "^.+\\.[jt]sx?$": "babel-jest" },
  testEnvironment: "node",
  testTimeout: 10000,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  globalSetup: "<rootDir>/jest.global-setup.js",
  moduleFileExtensions: ["js", "jsx", "json"],
};
