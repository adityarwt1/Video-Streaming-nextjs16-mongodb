import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import { Readable, PassThrough } from "stream";

export async function GET(req: NextRequest) {
  const client = new MongoClient(process.env.MONGODB_URI as string);

  try {
    const videoId = req.nextUrl.searchParams.get("id");
    if (!videoId) {
      return NextResponse.json(
        { error: "Video id must be provided in the params" },
        { status: 400 }
      );
    }

    await client.connect();
    const db = client.db("videos");
    const chunksCollection = db.collection("videoSegments.chunks");

    // Create temporary directory
    const tempDir = path.join(tmpdir(), `video-${videoId}-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Fetch all chunks for this files_id
    let n = 0;
    const segmentPath = path.join(tempDir, "segment.mp4");
    const writeStream = fs.createWriteStream(segmentPath);

    console.log(`Fetching chunks for files_id: ${videoId}`);

    while (true) {
      const chunk = await chunksCollection.findOne({
        files_id: new ObjectId(videoId),
        n,
      });

      if (!chunk) {
        console.log(`No more chunks found. Total chunks: ${n}`);
        break;
      }

      // Write chunk data to file
      const buffer = Buffer.from(chunk.data.buffer);
      writeStream.write(buffer);
      console.log(`Wrote chunk ${n}, size: ${buffer.length} bytes`);
      n++;
    }

    if (n === 0) {
      await client.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
      return NextResponse.json(
        { error: `No segments found for videoId: ${videoId}` },
        { status: 404 }
      );
    }

    // Close write stream
    await new Promise((resolve, reject) => {
      writeStream.end();
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    console.log(`Segment file created: ${segmentPath}`);

    // Cleanup function
    const cleanup = () => {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
        console.log("Cleanup completed");
      } catch (err) {
        console.error("Cleanup error:", err);
      }
    };

    let ffmpegProcess: any;

    // Stream the video using FFmpeg for proper formatting
    const videoStream = new ReadableStream({
      start(controller) {
        try {
          ffmpegProcess = ffmpeg(segmentPath)
            .outputOptions([
              "-c",
              "copy",
              "-movflags",
              "frag_keyframe+empty_moov+default_base_moof",
              "-f",
              "mp4",
            ])
            .on("start", (cmd) => {
              console.log("FFmpeg command:", cmd);
            })
            .on("error", (err) => {
              console.error("FFmpeg error:", err);
              controller.error(err);
              cleanup();
            })
            .on("end", () => {
              console.log("FFmpeg processing completed");
              controller.close();
              cleanup();
            });

          const ffmpegStream = ffmpegProcess.pipe();

          ffmpegStream.on("data", (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));
          });

          ffmpegStream.on("end", () => {
            controller.close();
            cleanup();
          });

          ffmpegStream.on("error", (err: Error) => {
            console.error("Stream error:", err);
            controller.error(err);
            cleanup();
          });
        } catch (err) {
          console.error("Start error:", err);
          controller.error(err);
          cleanup();
        }
      },
      cancel() {
        console.log("Stream cancelled by client");
        if (ffmpegProcess) {
          ffmpegProcess.kill("SIGKILL");
        }
        cleanup();
      },
    });

    // Close MongoDB connection
    setTimeout(() => {
      client.close().catch(console.error);
    }, 1000);

    return new Response(videoStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("API error:", error);
    await client.close();
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
