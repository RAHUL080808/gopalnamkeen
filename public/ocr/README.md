# Private browser OCR assets

Same-origin assets only. Bill images and OCR text are never uploaded to the OCR service and are not persisted.

- Worker: tesseract.js 6.0.1 (`dist/worker.min.js`).
- SIMD and non-SIMD LSTM cores: tesseract.js-core 6.1.2 from the locked dependency.
- English trained data: tesseract-ocr/tessdata_fast `eng.traineddata`, gzipped without timestamps.
- Language archive SHA-256: `4c2eca50c078bff5714711eec96f229a5ee4d1eeae063bb67409a0e214d6e376`.
- Source: https://github.com/tesseract-ocr/tessdata_fast (Apache-2.0).
- Retain the bundled license files when replacing these assets.

Refresh worker/core files from the installed locked versions when upgrading OCR. Keep both core variants and matching WASM files. Do not point browser OCR at a third-party CDN or language host.