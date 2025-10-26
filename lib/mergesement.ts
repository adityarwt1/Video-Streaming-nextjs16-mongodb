import fs from "fs";
import path from "path";
import { MongoClient, ObjectId } from "mongodb";
import ffmpeg from "fluent-ffmpeg";

const CHUNK_DIR = path.join(__dirname, "chunks");
const OUTPUT_FILE = path.join(__dirname, "output.mp4");

export async function mergeVideoSegments(videoId: string) {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  await client.connect();
  const db = client.db("videos");
  const chunksCollection = db.collection("videoSegments.chunks");

  // Ensure chunk directory exists
  if (!fs.existsSync(CHUNK_DIR)) fs.mkdirSync(CHUNK_DIR);

  // Fetch chunks
  const cursor = chunksCollection
    .find({ files_id: new ObjectId(videoId) })
    .sort({ n: 1 });
  let chunkFiles: string[] = [];
  let n = 0;

  for await (const chunk of cursor) {
    const filePath = path.join(CHUNK_DIR, `chunk_${n}.mp4`);
    fs.writeFileSync(filePath, Buffer.from(chunk.data, "base64"));
    chunkFiles.push(filePath);
    n++;
  }

  if (chunkFiles.length === 0) {
    console.log("No chunks found for video:", videoId);
    return;
  }

  // Create ffmpeg file list
  const fileListPath = path.join(CHUNK_DIR, "fileList.txt");
  const fileListContent = chunkFiles.map((f) => `file '${f}'`).join("\n");
  fs.writeFileSync(fileListPath, fileListContent);

  // Merge using ffmpeg
  ffmpeg()
    .input(fileListPath)
    .inputOptions(["-f concat", "-safe 0"])
    .outputOptions(["-c copy"])
    .output(OUTPUT_FILE)
    .on("start", (cmd) => console.log("FFmpeg command:", cmd))
    .on("progress", (progress) =>
      console.log("Processing:", progress.percent, "%")
    )
    .on("error", (err) => console.error("FFmpeg error:", err))
    .on("end", () => {
      console.log("Video merged successfully at:", OUTPUT_FILE);
      // Optional: cleanup temporary chunk files
      chunkFiles.forEach((f) => fs.unlinkSync(f));
      fs.unlinkSync(fileListPath);
    })
    .run();
}

// Replace with your videoId from MongoDB
