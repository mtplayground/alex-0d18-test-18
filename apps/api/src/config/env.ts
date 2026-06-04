export function readRequiredEnv(name: string, source: NodeJS.ProcessEnv = process.env): string {
  const value = source[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}
