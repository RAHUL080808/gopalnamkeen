# Shop Excel import
# Owner bill photo scanner
- [x] Add private browser OCR, editable confirmation, existing-shop matching and duplicate warnings while preserving manual bill entry.
- [x] Verify owner-only photo access, unchanged manual entry, real OCR, camera input, duplicates, corrections and confirmation saving on desktop/mobile; 40 tests pass and temporary test bills removed.
- [ ] Verify actual device-camera capture; requires a physical phone (camera photo-input path tested in browser).
# Payments page runtime error
- [x] Fix state initialization order and verify signed-in Payments and adjustment search; add regression coverage and clear existing compilation errors.
# Owner Payment Tools simplicity
- [x] Separate Adjustment and Transfer into independent, mobile-friendly workflows with simple labels, examples and confirmations.
- [x] Preserve payment mutations and security rules; verify signed-in real payment selections through confirmations without saving, regression payload/safety tests and compilation.
# Driver bill amount editing
- [ ] Add database-enforced amount-only driver edits and immutable owner-readable audit history.
- [ ] Add driver editing and owner history to existing bill screens.
- [ ] Test driver and owner permissions, balance/status updates and audit history.

- [x] Add compatible fields and owner-only duplicate-safe import to existing shops.
- [x] Add workbook upload, full preview and result counts to Shops.
- [x] Test rules, owner preview on desktop/mobile, driver denial at every boundary and failed-row database handling without writing test shops.
- [ ] Preview uploaded shops_import_ready.xlsx, import eligible records and verify successful saved rows through the UI.