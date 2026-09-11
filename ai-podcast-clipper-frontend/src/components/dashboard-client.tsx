"use client";

import type { Clip } from "@prisma/client";
import Link from "next/link";
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
        <h1 className="text-2xl font-bold tracking-tight">
          Estúdio de Cortes
        </h1>
        <p className="text-muted-foreground text-sm">
          Transforme podcasts e vídeos em clipes verticais prontos para TikTok, Reels e Shorts.
        </p>
      </div>

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">Importar Vídeo</TabsTrigger>
          <TabsTrigger value="my-clips">
            Meus Clipes
            {clips.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
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
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-medium">Fila de Processamento</CardTitle>
                    <CardDescription>
                      Acompanhe o status e a geração dos seus cortes em tempo real
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasActiveProcessing && (
                      <Badge
                        variant="outline"
                        className="flex items-center gap-1.5 border-amber-500/40 text-amber-500 text-xs animate-pulse"
                      >
                        <Loader2 className="h-3 w-3 animate-spin" /> Polling ativo (4s)
                      </Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefresh}
                      disabled={refreshing}
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
                <div className="max-h-[300px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Clips created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {uploadedFiles.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="max-w-xs truncate font-medium">
                            {item.filename}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {item.status === "queued" && (
                              <Badge variant="outline">Queued</Badge>
                            )}
                            {item.status === "processing" && (
                              <Badge variant="outline">Processing</Badge>
                            )}
                            {item.status === "processed" && (
                              <Badge variant="outline">Processed</Badge>
                            )}
                            {item.status === "no credits" && (
                              <Badge variant="destructive">No credits</Badge>
                            )}
                            {item.status === "failed" && (
                              <Badge variant="destructive">Failed</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.clipsCount > 0 ? (
                              <span>
                                {item.clipsCount} clip
                                {item.clipsCount !== 1 ? "s" : ""}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
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
          <Card>
            <CardHeader>
              <CardTitle>Meus Clipes Gerados</CardTitle>
              <CardDescription>
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
