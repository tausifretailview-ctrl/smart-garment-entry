import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

export type VideoQuality = "small" | "medium";

/** Short side in pixels, quality (lower CRF = better) and audio bitrate for each size. */
const PRESETS: Record<VideoQuality, { side: number; crf: number; audio: string }> = {
  small: { side: 480, crf: 30, audio: "64k" },
  medium: { side: 720, crf: 28, audio: "96k" },
};
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Downloads a campaign video and re-encodes it to an H.264 MP4 that every phone plays, with its short
 * side at most 480 / 720 px. The result is kept on the volume (one encode per campaign, reused after a
 * restart) and sent by file path, so Baileys still uploads it to WhatsApp only once.
 */
export async function shrinkVideo(opts: {
  url: string;
  quality: VideoQuality;
  dir: string;
  id: string;
  maxSourceBytes: number;
}): Promise<string> {
  const { url, quality, dir, id, maxSourceBytes } = opts;
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${id}-${quality}.mp4`);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;

  const src = path.join(dir, `${id}-source`);
  const tmp = `${out}.part`;
  try {
    const resp = await fetch(url);
    if (!resp.ok || !resp.body) throw new Error(`Could not download the video (${resp.status})`);
    if (Number(resp.headers.get("content-length") ?? 0) > maxSourceBytes) {
      await resp.body.cancel().catch(() => undefined);
      throw new Error(`Video is too large (max ${Math.round(maxSourceBytes / (1024 * 1024))} MB)`);
    }
    await pipeline(Readable.fromWeb(resp.body as WebReadableStream), fs.createWriteStream(src));

    const { side, crf, audio } = PRESETS[quality];
    // Landscape: limit the height; portrait: limit the width. Never upscale; -2 keeps the ratio with even sizes.
    const even = (v: string) => `trunc(min(${side},${v})/2)*2`;
    const scale = `scale='if(gt(iw,ih),-2,${even("iw")})':'if(gt(iw,ih),${even("ih")},-2)'`;
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", src,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-vf", scale,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", audio,
      "-movflags", "+faststart",
      "-threads", "2",
      "-f", "mp4", tmp,
    ]);
    fs.renameSync(tmp, out);
    return out;
  } finally {
    fs.rmSync(src, { force: true });
    fs.rmSync(tmp, { force: true });
  }
}

/** Deletes a campaign's encoded videos once it is finished. */
export function removeCampaignVideos(dir: string, id: string) {
  for (const q of Object.keys(PRESETS)) fs.rmSync(path.join(dir, `${id}-${q}.mp4`), { force: true });
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-500);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Video could not be made smaller (${e.message})`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Video could not be made smaller${stderr.trim() ? `: ${stderr.trim().split("\n").pop()}` : ""}`));
    });
  });
}
