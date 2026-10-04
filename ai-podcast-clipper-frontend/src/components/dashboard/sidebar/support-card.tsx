import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export function SupportCard() {
  return (
    <Card size="sm" className="overflow-hidden shadow-none group-data-[collapsible=icon]:hidden">
      <CardHeader className="min-w-0 px-4">
        <CardTitle className="truncate text-sm">Precisa de ajuda?</CardTitle>
        <CardDescription className="line-clamp-3">
          Fale com o suporte pelo e-mail{" "}
          <Link
            // TODO: substituir pelo e-mail de suporte real antes do go-live
            href="mailto:suporte@PREENCHER.com.br"
            className="text-foreground hover:underline"
          >
            suporte@PREENCHER.com.br
          </Link>
          .
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
