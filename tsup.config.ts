import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/bin.ts"],
  clean: true,
  treeshake: "smallest",
  external: ["@parcel/watcher"]
})
