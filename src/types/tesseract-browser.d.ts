declare module "tesseract.js/dist/tesseract.esm.min.js" {
  const Tesseract: { createWorker: typeof import("tesseract.js").createWorker };
  export default Tesseract;
}