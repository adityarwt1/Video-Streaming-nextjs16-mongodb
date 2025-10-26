// import { NextRequest, NextResponse } from "next/server";
// import { MongoClient, ObjectId } from "mongodb";

// export async function GET(req: NextRequest) {
//   try {
//     const videoId = req.nextUrl.searchParams.get("id");
//     if (!videoId) {
//       return NextResponse.json(
//         { error: "Video id must be provided in the params" },
//         { status: 400 }
//       );
//     }

//     const client = new MongoClient(process.env.MONGODB_URI as string);
//     await client.connect();

//     const db = client.db("videos");
//     const chunks = db.collection("videoSegments.chunks");

//     const encoder = new TextEncoder();

//     const stream = new ReadableStream({
//       async start(controller) {
//         let n = 0;
//         try {
//           while (true) {
//             const segment = await chunks.findOne({
//               files_id: new ObjectId(videoId),
//               n,
//             });

//             if (!segment) {
//               controller.close();
//               break;
//             }

//             // Encode and send as SSE data
//             controller.enqueue(
//               encoder.encode(`data: ${segment.data.toString("base64")}\n\n`)
//             );

//             n++;
//             await new Promise((res) => setTimeout(res, 4000));
//           }
//         } catch (err) {
//           controller.error(err);
//         } finally {
//           await client.close();
//         }
//       },
//     });

//     return new Response(stream, {
//       headers: {
//         "Content-Type": "text/event-stream",
//         "Cache-Control": "no-cache",
//         Connection: "keep-alive",
//       },
//     });
//   } catch (error) {
//     const data = { error: (error as Error).message };
//     return new Response(JSON.stringify(data), {
//       status: 500,
//       headers: {
//         "content-type": "application/json",
//       },
//     });
//   }
// }

import { NextRequest } from "next/server";
import { MongoClient, ObjectId } from "mongodb";

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("id");
  if (!videoId) {
    return new Response(JSON.stringify({ error: "Video id required" }), {
      status: 400,
    });
  }

  const client = new MongoClient(process.env.MONGODB_URI as string);
  await client.connect();
  const db = client.db("videos");
  const chunks = db.collection("videoSegments.chunks");

  const cursor = chunks
    .find({ files_id: new ObjectId(videoId) })
    .sort({ n: 1 });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of cursor) {
          controller.enqueue(
            encoder.encode(`data: ${chunk.data.toString("base64")}\n\n`)
          );
          await new Promise((r) => setTimeout(r, 4000));
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      } finally {
        await client.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
