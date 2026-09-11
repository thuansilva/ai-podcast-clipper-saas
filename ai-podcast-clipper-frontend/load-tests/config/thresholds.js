export const standardThresholds = {
  http_req_failed: ["rate<0.01"], // menos de 1% de erros HTTP
  http_req_duration: [
    "p(90)<150", // 90% das requisições abaixo de 150ms
    "p(95)<250", // 95% das requisições abaixo de 250ms
    "p(99)<500", // 99% das requisições abaixo de 500ms
  ],
};
