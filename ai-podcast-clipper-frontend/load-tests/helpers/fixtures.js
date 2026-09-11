/**
 * Gera um payload de evento checkout.session.completed do Stripe
 * @param {Object} options
 * @param {string} [options.customerId] - ID do cliente Stripe
 * @param {string} [options.priceId] - ID do preço do pacote
 * @returns {string} Payload em string JSON
 */
export function generateCheckoutSessionPayload({
  customerId = "cus_test_load_user",
  priceId = "price_small_pack",
} = {}) {
  const eventId = `evt_load_${Math.random().toString(36).substring(2, 10)}`;
  const sessionId = `cs_test_${Math.random().toString(36).substring(2, 10)}`;

  const event = {
    id: eventId,
    object: "event",
    api_version: "2025-04-30.basil",
    created: Math.floor(Date.now() / 1000),
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        customer: customerId,
        payment_status: "paid",
        status: "complete",
        line_items: {
          object: "list",
          data: [
            {
              id: `li_${Math.random().toString(36).substring(2, 8)}`,
              price: {
                id: priceId,
              },
              quantity: 1,
            },
          ],
        },
      },
    },
  };

  return JSON.stringify(event);
}
