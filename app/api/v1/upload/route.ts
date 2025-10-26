import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { MongoClient, GridFSBucket } from "mongodb";
import { tmpdir } from "os";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("video") as File;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    // Save file temporarily
    const uploadDir = path.join(tmpdir(), "uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const inputPath = path.join(uploadDir, file.name);
    fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

    const segmentsDir = path.join(uploadDir, "segments");
    if (!fs.existsSync(segmentsDir))
      fs.mkdirSync(segmentsDir, { recursive: true });
    const segmentPattern = path.join(segmentsDir, `segment_%03d.mp4`);

    // Split the video into 8s segments
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(["-c copy", "-map 0", "-f segment", "-segment_time 8"])
        .output(segmentPattern)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    // Connect to MongoDB and upload segments
    const client = await MongoClient.connect(process.env.MONGODB_URI as string);
    const db = client.db("videos");
    const bucket = new GridFSBucket(db, { bucketName: "videoSegments" });

    const segmentFiles = fs
      .readdirSync(segmentsDir)
      .filter((f) => f.endsWith(".mp4"));
    const videoId = new Date().getTime().toString();

    for (const [index, filename] of segmentFiles.entries()) {
      const filePath = path.join(segmentsDir, filename);
      const uploadStream = bucket.openUploadStream(filename, {
        metadata: { videoId, order: index },
      });
      fs.createReadStream(filePath).pipe(uploadStream);
      await new Promise((resolve) => uploadStream.on("finish", resolve));
    }

    client.close();
    return NextResponse.json({
      message: "Segments stored successfully",
      videoId,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
