# Shop Excel import
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