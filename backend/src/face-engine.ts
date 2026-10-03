import { createRequire } from "node:module";
import path from "node:path";
import sharp from "sharp";
import * as tf from "@tensorflow/tfjs";
import { setWasmPaths } from "@tensorflow/tfjs-backend-wasm";
import { fail } from "./http.js";
const require = createRequire(import.meta.url);
// This entry uses the locally installed WASM backend, not native TensorFlow binaries.
const faceapi =
  require("@vladmandic/face-api/dist/face-api.node-wasm.js") as typeof import("@vladmandic/face-api");
let loaded: Promise<void> | undefined;
let queue: Promise<unknown> = Promise.resolve();
export async function loadFaceModels() {
  return (loaded ??= (async () => {
    setWasmPaths(
      path.dirname(
        require.resolve("@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm"),
      ) + path.sep,
    );
    await tf.setBackend("wasm");
    await tf.ready();
    const model = path.join(
      path.dirname(require.resolve("@vladmandic/face-api/package.json")),
      "model",
    );
    await faceapi.nets.tinyFaceDetector.loadFromDisk(model);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(model);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(model);
  })().catch((e) => {
    loaded = undefined;
    throw e;
  }));
}
export async function describeFace(image: string) {
  const task = queue.then(async () => {
    if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(image))
      fail(400, "Send a JPEG or PNG camera frame");
    const bytes = Buffer.from(image.split(",")[1]!, "base64");
    if (bytes.length > 700_000) fail(413, "Camera frame is too large");
    try {
      await loadFaceModels();
    } catch {
      fail(
        503,
        "Face verification service could not start. Contact the campus administrator.",
      );
    }
    const decoded = await sharp(bytes, { limitInputPixels: 4_000_000 })
      .rotate()
      .resize({
        width: 640,
        height: 640,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .catch(() =>
        fail(
          422,
          "The camera image could not be decoded. Capture a new JPEG or PNG frame.",
        ),
      );
    const tensor = tf.tensor3d(
      new Uint8Array(decoded.data),
      [decoded.info.height, decoded.info.width, 3],
      "int32",
    );
    try {
      const faces = await faceapi
        .detectAllFaces(
          tensor as unknown as Parameters<typeof faceapi.detectAllFaces>[0],
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 320,
            scoreThreshold: 0.7,
          }),
        )
        .withFaceLandmarks()
        .withFaceDescriptors();
      if (faces.length !== 1)
        fail(422, "Show exactly one unobstructed face in the camera");
      const face = faces[0]!;
      if (face.detection.box.width < 80) fail(422, "Move closer to the camera");
      const eye1 = face.landmarks.getLeftEye(),
        eye2 = face.landmarks.getRightEye(),
        nose = face.landmarks.getNose();
      const avg = (p: { x: number }[]) =>
        p.reduce((sum, p) => sum + p.x, 0) / p.length;
      const pose =
        (nose[3]!.x - (avg(eye1) + avg(eye2)) / 2) / face.detection.box.width;
      const portrait =
        "data:image/jpeg;base64," +
        (
          await sharp(bytes)
            .rotate()
            .resize({ width: 320, height: 320, fit: "inside" })
            .jpeg({ quality: 65 })
            .toBuffer()
        ).toString("base64");
      return { descriptor: Array.from(face.descriptor), pose, portrait };
    } finally {
      tensor.dispose();
    }
  });
  queue = task.catch(() => undefined);
  return task;
}
export { faceDistance } from "./face-rules.js";
