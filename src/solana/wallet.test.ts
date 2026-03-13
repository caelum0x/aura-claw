import { Keypair } from "@solana/web3.js";
import { describe, it, expect } from "vitest";

describe("wallet", () => {
  describe("loadKeypair", () => {
    it("loads from JSON byte array string", async () => {
      const kp = Keypair.generate();
      const bytes = JSON.stringify(Array.from(kp.secretKey));

      // Set env
      const originalEnv = process.env.SOLANA_PRIVATE_KEY;
      process.env.SOLANA_PRIVATE_KEY = bytes;

      try {
        const { loadKeypair } = await import("./wallet.js");
        const loaded = await loadKeypair();
        expect(loaded.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
      } finally {
        if (originalEnv === undefined) {
          delete process.env.SOLANA_PRIVATE_KEY;
        } else {
          process.env.SOLANA_PRIVATE_KEY = originalEnv;
        }
      }
    });

    it("throws when no key source is available", async () => {
      const originalKey = process.env.SOLANA_PRIVATE_KEY;
      const originalPath = process.env.SOLANA_WALLET_PATH;
      delete process.env.SOLANA_PRIVATE_KEY;
      delete process.env.SOLANA_WALLET_PATH;

      try {
        const { loadKeypair } = await import("./wallet.js");
        await expect(loadKeypair({})).rejects.toThrow("No wallet keypair available");
      } finally {
        if (originalKey !== undefined) {
          process.env.SOLANA_PRIVATE_KEY = originalKey;
        }
        if (originalPath !== undefined) {
          process.env.SOLANA_WALLET_PATH = originalPath;
        }
      }
    });

    it("loads from explicit privateKey option (JSON array)", async () => {
      const kp = Keypair.generate();
      const bytes = JSON.stringify(Array.from(kp.secretKey));

      const { loadKeypair } = await import("./wallet.js");
      const loaded = await loadKeypair({ privateKey: bytes });
      expect(loaded.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
    });
  });
});
