// app/api/v1/stream-video/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";
import ffmpeg from "fluent-ffmpeg";
import { PassThrough, Readable } from "stream";

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("id");
  if (!videoId) {
    return NextResponse.json(
      { error: "Video id is required" },
      { status: 400 }
    );
  }

  const client = new MongoClient(process.env.MONGODB_URI as string);
  await client.connect();
  const db = client.db("videos");
  const chunksCollection = db.collection("videoSegments.chunks");

  let n = 0;
  const stream = new PassThrough();

  // Function to fetch next chunk and push to ffmpeg
  const fetchNextChunk = async (): Promise<Buffer | null> => {
    const chunk = await chunksCollection.findOne({
      files_id: new ObjectId(videoId),
      n,
    });
    if (!chunk) return null;
    n++;
    return Buffer.from(chunk.data, "base64");
  };

  // Create a Readable stream that fetches chunks one by one
  const videoStream = new Readable({
    read: async function () {
      try {
        const buffer = await fetchNextChunk();
        if (buffer) this.push(buffer);
        else this.push(null); // EOF
      } catch (err) {
        this.destroy(err);
      }
    },
  });

  // Pipe chunks into ffmpeg for concatenation
  ffmpeg(videoStream)
    .inputFormat("mp4") // adjust if your segments are another format
    .outputOptions(["-c copy"])
    .format("mp4")
    .on("start", (cmd) => console.log("FFmpeg started:", cmd))
    .on("progress", (progress) => console.log("Progress:", progress.percent))
    .on("error", async (err) => {
      console.error("FFmpeg error:", err);
      stream.end();
      await client.close();
    })
    .on("end", async () => {
      console.log("FFmpeg finished streaming");
      stream.end();
      await client.close();
    })
    .pipe(stream, { end: true });

  return new Response(stream, {
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
