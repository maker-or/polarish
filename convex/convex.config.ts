// convex/convex.config.ts

import dodopayments from "@dodopayments/convex/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(dodopayments);
export default app;
