export let migrationsDone = false;
export let migrationsError: Error | null = null;

export function setMigrationsDone() {
  migrationsDone = true;
}

export function setMigrationsError(err: Error) {
  migrationsError = err;
}
