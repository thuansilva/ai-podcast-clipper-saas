"use client";

import type { Clip } from "@prisma/client";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import { useRouter } from "next/navigation";
import { ClipDisplay } from "./clip-display";
import { ImportVideoTabs } from "./import-video-tabs";

export interface DashboardClientProps {
  uploadedFiles: {
    id: string;
    s3Key: string;
    filename: string;
    status: string;
    clipsCount: number;
    createdAt: Date;
  }[];
  clips: Clip[];
  userCredits: number;
}

export function DashboardClient({
  uploadedFiles,
  clips,
  userCredits,
}: DashboardClientProps) {
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const wasProcessingRef = useRef<boolean>(false);

  // Detecta se há arquivos em processamento ou na fila
  const hasActiveProcessing = uploadedFiles.some(
    (file) => file.status === "queued" || file.status === "processing",
  );

  useEffect(() => {
    if (hasActiveProcessing) {
      wasProcessingRef.current = true;
      const interval = setInterval(() => {
        router.refresh();
      }, 4000);

      return () => clearInterval(interval);
    } else if (wasProcessingRef.current) {
      wasProcessingRef.current = false;
      toast.success("Seus clipes estão prontos!");
    }
  }, [hasActiveProcessing, router]);

  const handleRefresh = async () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--marfim)]">
          Estúdio de Cortes
        </h1>
        <p className="text-sm text-[var(--fumaca)]">
          Transforme podcasts e vídeos em clipes verticais prontos para TikTok, Reels e Shorts.
        </p>
      </div>

      <Tabs defaultValue="upload">
        <TabsList className="bg-[#161310] border border-[var(--linha)] rounded-full p-1 h-auto">
          <TabsTrigger
            value="upload"
            className="rounded-full px-5 py-2 text-xs font-medium text-[var(--marfim-2)] data-[state=active]:bg-[var(--ouro)] data-[state=active]:text-[var(--tinta)] data-[state=active]:font-semibold transition-all cursor-pointer"
          >
            Importar Vídeo
          </TabsTrigger>
          <TabsTrigger
            value="my-clips"
            className="rounded-full px-5 py-2 text-xs font-medium text-[var(--marfim-2)] data-[state=active]:bg-[var(--ouro)] data-[state=active]:text-[var(--tinta)] data-[state=active]:font-semibold transition-all cursor-pointer"
          >
            Meus Clipes
            {clips.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px] rounded-full bg-[#1d1914] text-[var(--marfim)] border border-[var(--linha)]">
                {clips.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <ImportVideoTabs
            userCredits={userCredits}
            onUploadSuccess={handleRefresh}
          />

          {uploadedFiles.length > 0 && (
            <Card className="rounded-2xl border border-[var(--linha)] bg-[#161310] shadow-[0_0_30px_rgba(0,0,0,0.5)]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-medium text-[var(--marfim)]">Fila de Processamento</CardTitle>
                    <CardDescription className="text-xs text-[var(--fumaca)]">
                      Acompanhe o status e a geração dos seus cortes em tempo real
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasActiveProcessing && (
                      <Badge
                        variant="outline"
                        className="flex items-center gap-1.5 rounded-full border-[var(--ouro)]/40 bg-[var(--ouro)]/10 text-[var(--ouro)] font-mono text-xs animate-pulse"
                      >
                        <Loader2 className="h-3 w-3 animate-spin" /> Polling ativo (4s)
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="btn-linha !h-8 !px-3 !text-xs"
                    >
                      {refreshing && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Refresh
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[300px] overflow-auto rounded-xl border border-[var(--linha)] bg-[#0b0a08]">
                  <Table>
                    <TableHeader className="bg-[#1d1914] text-[var(--fumaca)] font-mono text-xs border-b border-[var(--linha)]">
                      <TableRow className="border-b border-[var(--linha)] hover:bg-transparent">
                        <TableHead className="text-[var(--marfim)]">File</TableHead>
                        <TableHead className="text-[var(--fumaca)]">Uploaded</TableHead>
                        <TableHead className="text-[var(--fumaca)]">Status</TableHead>
                        <TableHead className="text-[var(--fumaca)]">Clips created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {uploadedFiles.map((item) => (
                        <TableRow key={item.id} className="border-b border-[var(--linha)] hover:bg-[#1d1914]/50 transition-colors">
                          <TableCell className="max-w-xs truncate font-medium text-[var(--marfim)]">
                            {item.filename}
                          </TableCell>
                          <TableCell className="text-[var(--fumaca)] text-sm font-mono">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {item.status === "queued" && (
                              <Badge variant="outline" className="rounded-full border-[var(--linha-2)] bg-[#161310] text-[var(--prata)] font-mono text-[10px]">Queued</Badge>
                            )}
                            {item.status === "processing" && (
                              <Badge variant="outline" className="rounded-full border-[var(--ouro)]/40 bg-[var(--ouro)]/10 text-[var(--ouro)] font-mono text-[10px] animate-pulse">Processing</Badge>
                            )}
                            {item.status === "processed" && (
                              <Badge variant="outline" className="rounded-full border-[var(--patina)]/40 bg-[var(--patina)]/10 text-[var(--patina)] font-mono text-[10px]">Processed</Badge>
                            )}
                            {item.status === "no credits" && (
                              <Badge variant="destructive" className="rounded-full border-[var(--perigo)]/40 bg-[var(--perigo)]/10 text-[var(--perigo)] font-mono text-[10px]">No credits</Badge>
                            )}
                            {item.status === "failed" && (
                              <Badge variant="destructive" className="rounded-full border-[var(--perigo)]/40 bg-[var(--perigo)]/10 text-[var(--perigo)] font-mono text-[10px]">Failed</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.clipsCount > 0 ? (
                              <span className="font-mono text-xs text-[var(--patina)]">
                                {item.clipsCount} clip
                                {item.clipsCount !== 1 ? "s" : ""}
                              </span>
                            ) : (
                              <span className="text-[var(--fumaca)] font-mono text-xs">
                                No clips yet
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="my-clips">
          <Card className="rounded-2xl border border-[var(--linha)] bg-[#161310] shadow-[0_0_30px_rgba(0,0,0,0.5)]">
            <CardHeader>
              <CardTitle className="text-lg font-medium text-[var(--marfim)]">Meus Clipes Gerados</CardTitle>
              <CardDescription className="text-xs text-[var(--fumaca)]">
                Visualize, edite legendas e faça download dos seus cortes prontos para publicação.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClipDisplay clips={clips} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
