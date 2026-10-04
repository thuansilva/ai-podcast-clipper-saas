-- Suporte à carência de pagamento (webhook `invoice.payment_failed`):
-- adiciona `pastDueAt`, o instante em que a assinatura entrou em status
-- "past_due", usado pelo cron `suspendExpiredPastDueSubscriptions` para
-- decidir quando os 3 dias de carência expiraram e a conta deve ser
-- suspensa. Nulo enquanto a assinatura nunca esteve em carência, e
-- limpo de volta para nulo quando a carência é resolvida por um
-- `invoice.payment_succeeded` subsequente (ver ProcessSubscriptionRenewalUseCase).
ALTER TABLE "Subscription" ADD COLUMN "pastDueAt" TIMESTAMP(3);
