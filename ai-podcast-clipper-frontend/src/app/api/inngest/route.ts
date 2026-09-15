import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import {
  processVideo,
  processStripeWebhook,
  processSubscriptionEvent,
} from "~/inngest/functions";

// Create an API that serves functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processVideo, processStripeWebhook, processSubscriptionEvent],
});
