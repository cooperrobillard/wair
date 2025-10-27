-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "colorStd" TEXT;

-- CreateIndex
CREATE INDEX "Item_userId_articleType_idx" ON "Item"("userId", "articleType");

-- CreateIndex
CREATE INDEX "Item_userId_colorStd_idx" ON "Item"("userId", "colorStd");

-- CreateIndex
CREATE INDEX "Item_userId_brand_idx" ON "Item"("userId", "brand");

-- CreateIndex
CREATE INDEX "Item_userId_createdAt_idx" ON "Item"("userId", "createdAt");
