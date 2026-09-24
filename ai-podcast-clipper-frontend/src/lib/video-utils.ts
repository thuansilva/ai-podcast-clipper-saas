export async function generateVideoThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);

      // Limpar recursos ao final
      const cleanup = () => {
        URL.revokeObjectURL(url);
        video.remove();
      };

      video.addEventListener("loadeddata", () => {
        // Tenta capturar um quadro na metade do primeiro segundo, ou na metade do vídeo se for muito curto
        const targetTime = Math.min(1.0, video.duration / 2);
        video.currentTime = targetTime;
      });

      video.addEventListener("seeked", () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
            resolve(dataUrl);
          } else {
            resolve(null);
          }
        } catch (e) {
          console.error("Erro ao desenhar no canvas", e);
          resolve(null);
        } finally {
          cleanup();
        }
      });

      video.addEventListener("error", () => {
        console.error("Erro ao carregar o vídeo");
        cleanup();
        resolve(null);
      });

      // Carregar os dados iniciais silenciosamente
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      video.load();
    } catch (error) {
      console.error("Erro ao gerar thumbnail", error);
      resolve(null);
    }
  });
}
