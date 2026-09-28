import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import {
  makeUploadedFileRepository,
  makeClipRepository,
} from "~/infrastructure/factories/use-case-factories";
import {
  LOCAL_STORAGE_UPLOAD_DIR as UPLOAD_DIR,
  resolveLocalStoragePath as resolveSafeUploadPath,
} from "~/infrastructure/storage/local-storage-path";
import { MAX_VIDEO_UPLOAD_SIZE_BYTES } from "~/domain/schemas/generate-upload-url.schema";

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * A local-storage "key" stands in for a real S3 presigned URL, but unlike a
 * presigned URL it carries no signature/expiration — so we authorize each
 * request by checking that the key belongs to an UploadedFile or Clip owned
 * by the caller. Returns false both when the key isn't registered to anyone
 * and when it belongs to someone else, so a response can't be used to probe
 * which keys exist.
 */
async function isOwnedByUser(key: string, userId: string): Promise<boolean> {
  const file = await makeUploadedFileRepository().findByS3Key(key);
  if (file) return file.userId === userId;

  const clip = await makeClipRepository().findByS3Key(key);
  if (clip) return clip.userId === userId;

  return false;
}

export async function PUT(req: NextRequest) {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  const filePath = resolveSafeUploadPath(key);
  if (!filePath) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  if (!(await isOwnedByUser(key, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  ensureDir();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Create write stream
  const dest = fs.createWriteStream(filePath);
  let bytesWritten = 0;
  let tooLarge = false;

  await new Promise<void>((resolve, reject) => {
    dest.on("error", reject);
    dest.on("finish", resolve);

    void (async () => {
      if (req.body) {
        // NextRequest.body is a ReadableStream (web stream)
        const reader = req.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytesWritten += value.byteLength;
            if (bytesWritten > MAX_VIDEO_UPLOAD_SIZE_BYTES) {
              tooLarge = true;
              await reader.cancel();
              break;
            }
            dest.write(value);
          }
        } finally {
          dest.end();
        }
      } else {
        dest.end();
      }
    })().catch(reject);
  });

  if (tooLarge) {
    await fs.promises.unlink(filePath).catch(() => undefined);
    return NextResponse.json(
      { error: "File exceeds the maximum upload size" },
      { status: 413 }
    );
  }

  return NextResponse.json({ success: true, url: filePath });
}

export async function GET(req: NextRequest) {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  const filePath = resolveSafeUploadPath(key);
  if (!filePath) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  if (!(await isOwnedByUser(key, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.get("range");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0] ?? "", 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    
    const readableStream = new ReadableStream({
      start(controller) {
        file.on('data', (chunk) => controller.enqueue(chunk));
        file.on('end', () => controller.close());
        file.on('error', (err) => controller.error(err));
      }
    });

    const headers = new Headers();
    headers.set("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Length", chunksize.toString());
    headers.set("Content-Type", "video/mp4");

    return new NextResponse(readableStream, { status: 206, headers });
  } else {
    const file = fs.createReadStream(filePath);
    const readableStream = new ReadableStream({
      start(controller) {
        file.on('data', (chunk) => controller.enqueue(chunk));
        file.on('end', () => controller.close());
        file.on('error', (err) => controller.error(err));
      }
    });

    const headers = new Headers();
    headers.set("Content-Length", fileSize.toString());
    headers.set("Content-Type", "video/mp4");
    headers.set("Accept-Ranges", "bytes");
    
    return new NextResponse(readableStream, { status: 200, headers });
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  const filePath = resolveSafeUploadPath(key);
  if (!filePath) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  try {
    await fs.promises.unlink(filePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn("Failed to delete file:", error);
    }
  }

  return NextResponse.json({ success: true });
}
