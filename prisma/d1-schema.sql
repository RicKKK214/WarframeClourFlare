-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "isSetRoot" BOOLEAN NOT NULL DEFAULT false,
    "tradable" BOOLEAN NOT NULL DEFAULT true,
    "ducats" INTEGER,
    "thumb" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SetComposition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setSlug" TEXT NOT NULL,
    "partSlug" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SetComposition_setSlug_fkey" FOREIGN KEY ("setSlug") REFERENCES "Item" ("slug") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SetComposition_partSlug_fkey" FOREIGN KEY ("partSlug") REFERENCES "Item" ("slug") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setSlug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setBuyPrice" REAL,
    "setSellPrice" REAL,
    "partsCost" REAL,
    "partsValue" REAL,
    "spread" REAL,
    "bestProfit" REAL,
    "bestRoi" REAL,
    "bestStrategy" TEXT,
    "confidence" INTEGER
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setSlug" TEXT NOT NULL,
    "setName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "investment" REAL NOT NULL,
    "instantRevenue" REAL NOT NULL,
    "instantProfit" REAL NOT NULL,
    "instantRoi" REAL NOT NULL,
    "listingRevenue" REAL NOT NULL,
    "listingProfit" REAL NOT NULL,
    "listingRoi" REAL NOT NULL,
    "sellers" INTEGER NOT NULL,
    "buyers" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "partCount" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setSlug" TEXT NOT NULL,
    "setName" TEXT NOT NULL,
    "strategy" TEXT,
    "lastProfit" REAL,
    "prevProfit" REAL,
    "lastRoi" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "platform" TEXT NOT NULL DEFAULT 'pc',
    "crossplay" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'en',
    "pricingMode" TEXT NOT NULL DEFAULT 'median3',
    "refreshSeconds" INTEGER NOT NULL DEFAULT 120,
    "onlineOnly" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CachedAnalysis" (
    "setSlug" TEXT NOT NULL PRIMARY KEY,
    "setName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "bestProfit" REAL,
    "bestRoi" REAL,
    "confidence" INTEGER NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_slug_key" ON "Item"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SetComposition_setSlug_partSlug_key" ON "SetComposition"("setSlug", "partSlug");

-- CreateIndex
CREATE INDEX "MarketSnapshot_setSlug_createdAt_idx" ON "MarketSnapshot"("setSlug", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_setSlug_strategy_key" ON "Opportunity"("setSlug", "strategy");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_setSlug_key" ON "Watchlist"("setSlug");

-- CreateIndex
CREATE INDEX "CachedAnalysis_fetchedAt_idx" ON "CachedAnalysis"("fetchedAt");

-- CreateIndex
CREATE INDEX "CachedAnalysis_bestRoi_idx" ON "CachedAnalysis"("bestRoi");

