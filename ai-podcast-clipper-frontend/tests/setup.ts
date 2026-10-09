import "@testing-library/jest-dom/vitest";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  // connection_limit baixo: cada arquivo de teste de integração roda num
  // processo filho separado (Vitest, pool "forks", fileParallelism
  // habilitado por padrão), e cada processo abre seu próprio Prisma Client
  // com seu próprio pool de conexões. Sem limite explícito, o default do
  // Prisma (baseado em nº de CPUs) multiplicado pelo nº de processos em
  // paralelo pode se aproximar do max_connections do Postgres conforme a
  // suíte crescer.
  "postgresql://postgres:postgres@localhost:5432/ai_podcast_clipper?connection_limit=5";
process.env.STORAGE_PROVIDER = "local";
process.env.AWS_ACCESS_KEY_ID = "mock_key";
process.env.AWS_SECRET_ACCESS_KEY = "mock_secret";
process.env.AWS_REGION = "us-east-1";
process.env.S3_BUCKET_NAME = "mock-bucket";
process.env.PROCESS_VIDEO_ENDPOINT = "https://mock.modal.run/process_video";
process.env.PROCESS_VIDEO_ENDPOINT_AUTH = "mock-auth-token";
process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.STRIPE_PRICE_ID_PLAN_STARTER_MONTHLY = "price_starter_monthly_mock";
process.env.STRIPE_PRICE_ID_PLAN_STARTER_ANNUAL = "price_starter_annual_mock";
process.env.STRIPE_PRICE_ID_PLAN_PRO_MONTHLY = "price_pro_monthly_mock";
process.env.STRIPE_PRICE_ID_PLAN_PRO_ANNUAL = "price_pro_annual_mock";
process.env.STRIPE_SMALL_CREDIT_PACK = "price_small_123";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
process.env.BASE_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_mock";
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_mock_clerk";
process.env.CLERK_SECRET_KEY = "sk_test_mock_clerk";
process.env.CLERK_WEBHOOK_SECRET = "whsec_mock_clerk";
process.env.INNGEST_EVENT_KEY = "evt_test_mock_key";
process.env.STRIPE_CREATOR_SUBSCRIPTION_PRICE_ID = "price_creator_mock";
process.env.STRIPE_PRO_STUDIO_SUBSCRIPTION_PRICE_ID = "price_pro_studio_mock";
