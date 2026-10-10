// Loaded via `node --import tsx` to confirm the compiled app resolves using the
// runtime dependency graph (no DB connection is opened by importing AppModule).
import("../dist/app.module.js")
  .then(() => {
    console.log("dist/app.module.js loaded with runtime dependencies");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
