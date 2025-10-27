import { NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";

export async function GET(req) {
  const client = new MongoClient(process.env.MONGODB_URI);

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

    const file = await filesCollection.findOne({ _id: new ObjectId(videoId) });

    if (!file) {
      await client.close();
      return NextResponse.json(
        { error: `File not found for id: ${videoId}` },
        { status: 404 }
      );
    }

    console.log(
      `Found file: ${file.filename}, videoId: ${file.metadata?.videoId}`
    );

    const allSegmentFiles = await filesCollection
      .find({ "metadata.videoId": file.metadata.videoId })
      .sort({ "metadata.order": 1 })
      .toArray();

    console.log(`Found ${allSegmentFiles.length} total segments`);

    if (allSegmentFiles.length === 0) {
      await client.close();
      return NextResponse.json({ error: "No segments found" }, { status: 404 });
    }

    const tempDir = path.join(
      tmpdir(),
      `video-${file.metadata.videoId}-${Date.now()}`
    );
    fs.mkdirSync(tempDir, { recursive: true });

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

    let ffmpegProcess;

    const videoStream = new ReadableStream({
      async start(controller) {
        try {
          console.log(
            "Fetching all segments in parallel for faster loading..."
          );
          const startTime = Date.now();

          // Fetch all segments in parallel (much faster!)
          const segmentPromises = allSegmentFiles.map(
            async (segmentFile, index) => {
              const segmentPath = path.join(tempDir, segmentFile.filename);
              const writeStream = fs.createWriteStream(segmentPath);

              console.log(
                `[${index + 1}/${allSegmentFiles.length}] Starting: ${
                  segmentFile.filename
                }`
              );

              let n = 0;
              let totalBytes = 0;

              while (true) {
                const chunk = await chunksCollection.findOne({
                  files_id: segmentFile._id,
                  n,
                });

                if (!chunk) {
                  break;
                }

                const buffer = Buffer.from(chunk.data.buffer);
                writeStream.write(buffer);
                totalBytes += buffer.length;
                n++;
              }

              await new Promise((resolve, reject) => {
                writeStream.end();
                writeStream.on("finish", () => resolve());
                writeStream.on("error", reject);
              });

              console.log(
                `[${index + 1}/${allSegmentFiles.length}] ✓ Complete: ${
                  segmentFile.filename
                } (${totalBytes} bytes)`
              );
              return segmentPath;
            }
          );

          // Wait for all segments to be fetched
          const segmentPaths = await Promise.all(segmentPromises);

          const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(
            `\n✓ All ${segmentPaths.length} segments fetched in ${fetchTime}s`
          );

          // Create concat file
          let inputSource;
          let inputOptions = [];

          if (segmentPaths.length === 1) {
            inputSource = segmentPaths[0];
            console.log("Single segment - streaming directly");
          } else {
            const concatFilePath = path.join(tempDir, "concat.txt");
            const concatContent = segmentPaths
              .map(
                (p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`
              )
              .join("\n");
            fs.writeFileSync(concatFilePath, concatContent);

            inputSource = concatFilePath;
            inputOptions = ["-f", "concat", "-safe", "0"];

            console.log("Starting FFmpeg concat and stream...");
          }

          // Start FFmpeg streaming
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
              console.log("FFmpeg started:", cmd);
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

          ffmpegStream.on("data", (chunk) => {
            controller.enqueue(new Uint8Array(chunk));
          });

          ffmpegStream.on("end", () => {
            controller.close();
            cleanup();
          });

          ffmpegStream.on("error", (err) => {
            console.error("Stream error:", err);
            controller.error(err);
            cleanup();
          });
        } catch (err) {
          console.error("Start error:", err);
          controller.error(err);
          cleanup();
        } finally {
          setTimeout(() => {
            client.close().catch(console.error);
          }, 1000);
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
// import { NextResponse } from "next/server";
// import { MongoClient, ObjectId } from "mongodb";
// import ffmpeg from "fluent-ffmpeg";
// import fs from "fs";
// import path from "path";
// import { tmpdir } from "os";

// export async function GET(req) {
//   const client = new MongoClient(process.env.MONGODB_URI);

//   try {
//     const videoId = req.nextUrl.searchParams.get("id");
//     if (!videoId) {
//       return NextResponse.json(
//         { error: "Video id must be provided in the params" },
//         { status: 400 }
//       );
//     }

//     await client.connect();
//     const db = client.db("videos");
//     const filesCollection = db.collection("videoSegments.files");
//     const chunksCollection = db.collection("videoSegments.chunks");

//     const file = await filesCollection.findOne({ _id: new ObjectId(videoId) });

//     if (!file) {
//       await client.close();
//       return NextResponse.json(
//         { error: `File not found for id: ${videoId}` },
//         { status: 404 }
//       );
//     }

//     console.log(
//       `Found file: ${file.filename}, videoId: ${file.metadata?.videoId}`
//     );

//     const allSegmentFiles = await filesCollection
//       .find({ "metadata.videoId": file.metadata.videoId })
//       .sort({ "metadata.order": 1 })
//       .toArray();

//     console.log(`Found ${allSegmentFiles.length} total segments`);

//     if (allSegmentFiles.length === 0) {
//       await client.close();
//       return NextResponse.json({ error: "No segments found" }, { status: 404 });
//     }

//     const tempDir = path.join(
//       tmpdir(),
//       `video-${file.metadata.videoId}-${Date.now()}`
//     );
//     fs.mkdirSync(tempDir, { recursive: true });

//     const cleanup = () => {
//       try {
//         if (fs.existsSync(tempDir)) {
//           fs.rmSync(tempDir, { recursive: true, force: true });
//         }
//         console.log("Cleanup completed");
//       } catch (err) {
//         console.error("Cleanup error:", err);
//       }
//     };

//     let ffmpegProcess;

//     const videoStream = new ReadableStream({
//       async start(controller) {
//         try {
//           console.log(
//             "Fetching all segments in parallel for faster loading..."
//           );
//           const startTime = Date.now();

//           // Fetch all segments in parallel (much faster!)
//           const segmentPromises = allSegmentFiles.map(
//             async (segmentFile, index) => {
//               const segmentPath = path.join(tempDir, segmentFile.filename);
//               const writeStream = fs.createWriteStream(segmentPath);

//               console.log(
//                 `[${index + 1}/${allSegmentFiles.length}] Starting: ${
//                   segmentFile.filename
//                 }`
//               );

//               let n = 0;
//               let totalBytes = 0;

//               while (true) {
//                 const chunk = await chunksCollection.findOne({
//                   files_id: segmentFile._id,
//                   n,
//                 });

//                 if (!chunk) {
//                   break;
//                 }

//                 const buffer = Buffer.from(chunk.data.buffer);
//                 writeStream.write(buffer);
//                 totalBytes += buffer.length;
//                 n++;
//               }

//               await new Promise((resolve, reject) => {
//                 writeStream.end();
//                 writeStream.on("finish", () => resolve());
//                 writeStream.on("error", reject);
//               });

//               console.log(
//                 `[${index + 1}/${allSegmentFiles.length}] ✓ Complete: ${
//                   segmentFile.filename
//                 } (${totalBytes} bytes)`
//               );
//               return segmentPath;
//             }
//           );

//           // Wait for all segments to be fetched
//           const segmentPaths = await Promise.all(segmentPromises);

//           const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
//           console.log(
//             `\n✓ All ${segmentPaths.length} segments fetched in ${fetchTime}s`
//           );

//           // Create concat file
//           let inputSource;
//           let inputOptions = [];

//           if (segmentPaths.length === 1) {
//             inputSource = segmentPaths[0];
//             console.log("Single segment - streaming directly");
//           } else {
//             const concatFilePath = path.join(tempDir, "concat.txt");
//             const concatContent = segmentPaths
//               .map(
//                 (p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`
//               )
//               .join("\n");
//             fs.writeFileSync(concatFilePath, concatContent);

//             inputSource = concatFilePath;
//             inputOptions = ["-f", "concat", "-safe", "0"];

//             console.log("Starting FFmpeg concat and stream...");
//           }

//           // Start FFmpeg streaming
//           ffmpegProcess = ffmpeg()
//             .input(inputSource)
//             .inputOptions(inputOptions)
//             .outputOptions([
//               "-c",
//               "copy",
//               "-movflags",
//               "frag_keyframe+empty_moov+default_base_moof",
//               "-f",
//               "mp4",
//             ])
//             .on("start", (cmd) => {
//               console.log("FFmpeg started:", cmd);
//             })
//             .on("error", (err) => {
//               console.error("FFmpeg error:", err);
//               controller.error(err);
//               cleanup();
//             })
//             .on("end", () => {
//               console.log("FFmpeg processing completed");
//               controller.close();
//               cleanup();
//             });

//           const ffmpegStream = ffmpegProcess.pipe();

//           ffmpegStream.on("data", (chunk) => {
//             controller.enqueue(new Uint8Array(chunk));
//           });

//           ffmpegStream.on("end", () => {
//             controller.close();
//             cleanup();
//           });

//           ffmpegStream.on("error", (err) => {
//             console.error("Stream error:", err);
//             controller.error(err);
//             cleanup();
//           });
//         } catch (err) {
//           console.error("Start error:", err);
//           controller.error(err);
//           cleanup();
//         } finally {
//           setTimeout(() => {
//             client.close().catch(console.error);
//           }, 1000);
//         }
//       },
//       cancel() {
//         console.log("Stream cancelled by client");
//         if (ffmpegProcess) {
//           ffmpegProcess.kill("SIGKILL");
//         }
//         cleanup();
//       },
//     });

//     return new Response(videoStream, {
//       headers: {
//         "Content-Type": "video/mp4",
//         "Cache-Control": "no-cache",
//         "Transfer-Encoding": "chunked",
//         "Access-Control-Allow-Origin": "*",
//       },
//     });
//   } catch (error) {
//     console.error("API error:", error);
//     await client.close();
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }
// import { NextRequest, NextResponse } from "next/server";
// import { MongoClient, ObjectId } from "mongodb";
// import ffmpeg from "fluent-ffmpeg";
// import fs from "fs";
// import path from "path";
// import { tmpdir } from "os";

// export async function GET(req: NextRequest) {
//   const client = new MongoClient(process.env.MONGODB_URI as string);

//   try {
//     const videoId = req.nextUrl.searchParams.get("id");
//     if (!videoId) {
//       return NextResponse.json(
//         { error: "Video id must be provided in the params" },
//         { status: 400 }
//       );
//     }

//     await client.connect();
//     const db = client.db("videos");
//     const filesCollection = db.collection("videoSegments.files");
//     const chunksCollection = db.collection("videoSegments.chunks");

//     const file = await filesCollection.findOne({ _id: new ObjectId(videoId) });

//     if (!file) {
//       await client.close();
//       return NextResponse.json(
//         { error: `File not found for id: ${videoId}` },
//         { status: 404 }
//       );
//     }

//     console.log(
//       `Found file: ${file.filename}, videoId: ${file.metadata?.videoId}`
//     );

//     const allSegmentFiles = await filesCollection
//       .find({ "metadata.videoId": file.metadata.videoId })
//       .sort({ "metadata.order": 1 })
//       .toArray();

//     console.log(`Found ${allSegmentFiles.length} total segments`);

//     if (allSegmentFiles.length === 0) {
//       await client.close();
//       return NextResponse.json({ error: "No segments found" }, { status: 404 });
//     }

//     const tempDir = path.join(
//       tmpdir(),
//       `video-${file.metadata.videoId}-${Date.now()}`
//     );
//     fs.mkdirSync(tempDir, { recursive: true });

//     const cleanup = () => {
//       try {
//         if (fs.existsSync(tempDir)) {
//           fs.rmSync(tempDir, { recursive: true, force: true });
//         }
//         console.log("Cleanup completed");
//       } catch (err) {
//         console.error("Cleanup error:", err);
//       }
//     };

//     let ffmpegProcess: any;

//     const videoStream = new ReadableStream({
//       async start(controller) {
//         try {
//           console.log(
//             "Fetching all segments in parallel for faster loading..."
//           );
//           const startTime = Date.now();

//           // Fetch all segments in parallel (much faster!)
//           const segmentPromises = allSegmentFiles.map(
//             async (segmentFile, index) => {
//               const segmentPath = path.join(tempDir, segmentFile.filename);
//               const writeStream = fs.createWriteStream(segmentPath);

//               console.log(
//                 `[${index + 1}/${allSegmentFiles.length}] Starting: ${
//                   segmentFile.filename
//                 }`
//               );

//               let n = 0;
//               let totalBytes = 0;

//               while (true) {
//                 const chunk = await chunksCollection.findOne({
//                   files_id: segmentFile._id,
//                   n,
//                 });

//                 if (!chunk) {
//                   break;
//                 }

//                 const buffer = Buffer.from(chunk.data.buffer);
//                 writeStream.write(buffer);
//                 totalBytes += buffer.length;
//                 n++;
//               }

//               await new Promise<void>((resolve, reject) => {
//                 writeStream.end();
//                 writeStream.on("finish", () => resolve());
//                 writeStream.on("error", reject);
//               });

//               console.log(
//                 `[${index + 1}/${allSegmentFiles.length}] ✓ Complete: ${
//                   segmentFile.filename
//                 } (${totalBytes} bytes)`
//               );
//               return segmentPath;
//             }
//           );

//           // Wait for all segments to be fetched
//           const segmentPaths = await Promise.all(segmentPromises);

//           const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
//           console.log(
//             `\n✓ All ${segmentPaths.length} segments fetched in ${fetchTime}s`
//           );

//           // Create concat file
//           let inputSource: string;
//           let inputOptions: string[] = [];

//           if (segmentPaths.length === 1) {
//             inputSource = segmentPaths[0];
//             console.log("Single segment - streaming directly");
//           } else {
//             const concatFilePath = path.join(tempDir, "concat.txt");
//             const concatContent = segmentPaths
//               .map(
//                 (p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`
//               )
//               .join("\n");
//             fs.writeFileSync(concatFilePath, concatContent);

//             inputSource = concatFilePath;
//             inputOptions = ["-f", "concat", "-safe", "0"];

//             console.log("Starting FFmpeg concat and stream...");
//           }

//           // Start FFmpeg streaming
//           ffmpegProcess = ffmpeg()
//             .input(inputSource)
//             .inputOptions(inputOptions)
//             .outputOptions([
//               "-c",
//               "copy",
//               "-movflags",
//               "frag_keyframe+empty_moov+default_base_moof",
//               "-f",
//               "mp4",
//             ])
//             .on("start", (cmd) => {
//               console.log("FFmpeg started:", cmd);
//             })
//             .on("error", (err) => {
//               console.error("FFmpeg error:", err);
//               controller.error(err);
//               cleanup();
//             })
//             .on("end", () => {
//               console.log("FFmpeg processing completed");
//               controller.close();
//               cleanup();
//             });

//           const ffmpegStream = ffmpegProcess.pipe();

//           ffmpegStream.on("data", (chunk: Buffer) => {
//             controller.enqueue(new Uint8Array(chunk));
//           });

//           ffmpegStream.on("end", () => {
//             controller.close();
//             cleanup();
//           });

//           ffmpegStream.on("error", (err: Error) => {
//             console.error("Stream error:", err);
//             controller.error(err);
//             cleanup();
//           });
//         } catch (err) {
//           console.error("Start error:", err);
//           controller.error(err);
//           cleanup();
//         } finally {
//           setTimeout(() => {
//             client.close().catch(console.error);
//           }, 1000);
//         }
//       },
//       cancel() {
//         console.log("Stream cancelled by client");
//         if (ffmpegProcess) {
//           ffmpegProcess.kill("SIGKILL");
//         }
//         cleanup();
//       },
//     });

//     return new Response(videoStream, {
//       headers: {
//         "Content-Type": "video/mp4",
//         "Cache-Control": "no-cache",
//         "Transfer-Encoding": "chunked",
//         "Access-Control-Allow-Origin": "*",
//       },
//     });
//   } catch (error) {
//     console.error("API error:", error);
//     await client.close();
//     return NextResponse.json(
//       { error: (error as Error).message },
//       { status: 500 }
//     );
//   }
// }
