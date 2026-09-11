/**
 * Retorna cabeçalhos HTTP padrões para requisições do k6
 * @param {Object} [customHeaders]
 * @returns {Object}
 */
export function getCommonHeaders(customHeaders = {}) {
  return Object.assign(
    {
      "Content-Type": "application/json",
      "User-Agent": "k6-load-testing-agent/1.0",
    },
    customHeaders
  );
}
