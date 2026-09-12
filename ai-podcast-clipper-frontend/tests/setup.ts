import "@testing-library/jest-dom/vitest";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/ai_podcast_clipper";
process.env.AWS_ACCESS_KEY_ID = "mock_key";
process.env.AWS_SECRET_ACCESS_KEY = "mock_secret";
process.env.AWS_REGION = "us-east-1";
process.env.S3_BUCKET_NAME = "mock-bucket";
process.env.PROCESS_VIDEO_ENDPOINT = "https://mock.modal.run/process_video";
process.env.PROCESS_VIDEO_ENDPOINT_AUTH = "mock-auth-token";
process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.STRIPE_SMALL_CREDIT_PACK = "price_small_123";
process.env.STRIPE_MEDIUM_CREDIT_PACK = "price_med_456";
process.env.STRIPE_LARGE_CREDIT_PACK = "price_large_789";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
process.env.BASE_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_mock";
