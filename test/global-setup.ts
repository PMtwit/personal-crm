import { prepareTestDatabase, testDatabaseUrl } from "../e2e/test-database";

// Runs once before all unit tests: creates the test database if it is missing
// and brings its schema up to date with the migrations. The same URL is given
// to the tests in vitest.config.ts
export default async function globalSetup() {
  await prepareTestDatabase(testDatabaseUrl("unit_test"));
}
