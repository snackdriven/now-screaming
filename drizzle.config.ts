import { defineConfig } from "drizzle-kit";

const schema = process.env.DB_SCHEMA_PATH?.trim().replaceAll("\\", "/");
if (!schema) {
  throw new Error(
    "Set DB_SCHEMA_PATH to your application schema before generating migrations. Example schemas are opt-in.",
  );
}

export default defineConfig({
  out: "./drizzle",
  schema,
  dialect: "sqlite",
});
