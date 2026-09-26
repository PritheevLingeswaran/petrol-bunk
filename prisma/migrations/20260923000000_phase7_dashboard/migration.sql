-- CreateIndex
CREATE INDEX "voucher_lines_outletId_accountId_businessDate_idx" ON "voucher_lines"("outletId", "accountId", "businessDate");

-- CreateIndex
CREATE INDEX "vouchers_outletId_status_businessDate_idx" ON "vouchers"("outletId", "status", "businessDate");

