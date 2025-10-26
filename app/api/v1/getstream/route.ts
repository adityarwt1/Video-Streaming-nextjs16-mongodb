import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";

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
    const filesCollection = db.collection("videoSegments.files");
    const chunksCollection = db.collection("videoSegments.chunks");

    // First, find the file to get its metadata.videoId
    const file = await filesCollection.findOne({ _id: new ObjectId(videoId) });

    if (!file) {
      await client.close();
      return NextResponse.json(
        { error: `File not found for id: ${videoId}` },
        { status: 404 }
      );
    }

    console.log(
      `Found file: ${file.filename}, videoId: ${file.metadata?.videoId}, order: ${file.metadata?.order}`
    );

    // Now find ALL segments with the same metadata.videoId
    const allSegmentFiles = await filesCollection
      .find({ "metadata.videoId": file.metadata.videoId })
      .sort({ "metadata.order": 1 })
      .toArray();

    console.log(
      `Found ${allSegmentFiles.length} total segments for videoId: ${file.metadata.videoId}`
    );

    // Create temporary directory
    const tempDir = path.join(
      tmpdir(),
      `video-${file.metadata.videoId}-${Date.now()}`
    );
    fs.mkdirSync(tempDir, { recursive: true });

    const segmentPaths: string[] = [];

    // Process each segment file
    for (const segmentFile of allSegmentFiles) {
      const segmentPath = path.join(tempDir, segmentFile.filename);
      const writeStream = fs.createWriteStream(segmentPath);

      console.log(
        `\nProcessing segment: ${segmentFile.filename} (order: ${segmentFile.metadata.order}, _id: ${segmentFile._id})`
      );

      // Fetch all chunks for this files_id
      let n = 0;
      let totalBytes = 0;

      while (true) {
        const chunk = await chunksCollection.findOne({
          files_id: segmentFile._id,
          n,
        });

        if (!chunk) {
          console.log(`  ✓ Finished: ${n} chunks, ${totalBytes} bytes total`);
          break;
        }

        const buffer = Buffer.from(chunk.data.buffer);
        writeStream.write(buffer);
        totalBytes += buffer.length;
        console.log(`  - Chunk ${n}: ${buffer.length} bytes`);
        n++;
      }

      // Close write stream
      await new Promise((resolve, reject) => {
        writeStream.end();
        writeStream.on("finish", () => resolve);
        writeStream.on("error", reject);
      });

      segmentPaths.push(segmentPath);
    }

    if (segmentPaths.length === 0) {
      await client.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
      return NextResponse.json({ error: `No segments found` }, { status: 404 });
    }

    console.log(
      `\n✓ Created ${segmentPaths.length} segment files in ${tempDir}`
    );

    // Create concat file for ffmpeg (only needed if multiple segments)
    let inputSource: string;
    let inputOptions: string[] = [];

    if (segmentPaths.length === 1) {
      // Single segment - no concat needed
      inputSource = segmentPaths[0];
      console.log("Single segment - streaming directly");
    } else {
      // Multiple segments - use concat
      const concatFilePath = path.join(tempDir, "concat.txt");
      const concatContent = segmentPaths
        .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
        .join("\n");
      fs.writeFileSync(concatFilePath, concatContent);

      inputSource = concatFilePath;
      inputOptions = ["-f", "concat", "-safe", "0"];

      console.log("Multiple segments - using FFmpeg concat");
      console.log("Concat file:\n", concatContent);
    }

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

    // Stream the video
    const videoStream = new ReadableStream({
      start(controller) {
        try {
          ffmpegProcess = ffmpeg()
            .input(inputSource)
            .inputOptions(inputOptions)
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
