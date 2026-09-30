import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { expect } from "chai";
import { PrivateKey } from "@hiero-ledger/sdk";
import {
  gitCheckIgnore,
  isDerPrivateKey,
  isEcdsaHexKey,
  isRawEd25519Hex,
  normalizeHexKey,
  parseDeployerKey,
  parseEd25519PrivateKey,
  scanSecretShapes,
} from "../../scripts/dx/lib";

const HARDHAT_DEFAULT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const HARDHAT_DEFAULT_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function tempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dx-test-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

describe("dx/lib key parsing", function () {
  it("distinguishes raw Ed25519 hex, DER and 0x ECDSA keys", function () {
    const raw = PrivateKey.generateED25519().toStringRaw();
    expect(isRawEd25519Hex(raw)).to.equal(true);
    expect(isRawEd25519Hex(HARDHAT_DEFAULT_KEY)).to.equal(false);
    expect(isEcdsaHexKey(HARDHAT_DEFAULT_KEY)).to.equal(true);
    expect(isEcdsaHexKey(raw)).to.equal(true);
    expect(isDerPrivateKey(PrivateKey.generateED25519().toStringDer())).to.equal(true);
    expect(isDerPrivateKey(raw)).to.equal(false);
  });

  it("parses a raw Ed25519 key and reports the public key", function () {
    const key = PrivateKey.generateED25519();
    const info = parseEd25519PrivateKey(key.toStringRaw());
    expect(info.der).to.equal(key.toStringDer());
    expect(info.publicKeyRaw).to.equal(key.publicKey.toStringRaw().toLowerCase());
    expect(info.publicKeyDer).to.equal(key.publicKey.toStringDer());
  });

  it("parses a DER Ed25519 key identically to its raw form", function () {
    const key = PrivateKey.generateED25519();
    const fromDer = parseEd25519PrivateKey(key.toStringDer());
    const fromRaw = parseEd25519PrivateKey(key.toStringRaw());
    expect(fromDer.publicKeyRaw).to.equal(fromRaw.publicKeyRaw);
    expect(fromDer.der).to.equal(key.toStringDer());
  });

  it("rejects non-Ed25519 and malformed values", function () {
    expect(() => parseEd25519PrivateKey("not-a-key")).to.throw(/Ed25519/);
    expect(() => parseEd25519PrivateKey(HARDHAT_DEFAULT_KEY.replace("0x", "") + "00")).to.throw();
  });

  it("normalises 0x-prefixed hex and rejects bad lengths", function () {
    expect(normalizeHexKey(HARDHAT_DEFAULT_KEY.toUpperCase())).to.equal(HARDHAT_DEFAULT_KEY.toLowerCase());
    expect(() => normalizeHexKey("0x1234")).to.throw();
  });
});

describe("dx/lib address derivation", function () {
  it("derives the address of the well-known Hardhat key", function () {
    const info = parseDeployerKey(HARDHAT_DEFAULT_KEY);
    expect(info.kind).to.equal("plain");
    expect(info.address).to.equal(HARDHAT_DEFAULT_ADDRESS);
  });

  it("reads the address from a keystore JSON blob", function () {
    const info = parseDeployerKey(JSON.stringify({ address: HARDHAT_DEFAULT_ADDRESS.slice(2) }));
    expect(info.kind).to.equal("keystore");
    expect(info.address).to.equal(HARDHAT_DEFAULT_ADDRESS);
  });

  it("rejects a keystore without an address", function () {
    expect(() => parseDeployerKey(JSON.stringify({ version: 3 }))).to.throw(/address/);
  });
});

describe("dx/lib gitignore check", function () {
  it("detects ignored vs tracked files", function () {
    const repo = tempRepo();
    fs.writeFileSync(path.join(repo, ".gitignore"), "*.env\n.env.local\n");
    fs.writeFileSync(path.join(repo, "secret.env"), "x");
    fs.writeFileSync(path.join(repo, "kept.txt"), "x");
    expect(gitCheckIgnore(repo, "secret.env")).to.equal(true);
    expect(gitCheckIgnore(repo, "kept.txt")).to.equal(false);
  });
});

describe("dx/lib secret-shaped string scan", function () {
  it("flags key assignments, DER keys, keystore JSON and bare 64-hex", function () {
    const repo = tempRepo();
    const der = PrivateKey.generateED25519().toStringDer();
    const raw = PrivateKey.generateED25519().toStringRaw();
    fs.writeFileSync(
      path.join(repo, "leak.ts"),
      [
        `const a = "PRIVATE_KEY=0x${"1".repeat(64)}";`,
        `const b = "${der}";`,
        `const c = '{"ciphertext":"abc","kdf":"scrypt"}';`,
        `const d = "${raw}";`,
      ].join("\n"),
    );
    const hits = scanSecretShapes(repo, ["leak.ts"]);
    const kinds = hits.map(h => h.kind);
    expect(kinds).to.include("secret assignment");
    expect(kinds).to.include("Ed25519 DER key");
    expect(kinds).to.include("keystore JSON");
    expect(kinds).to.include("64-hex value");
    expect(hits.every(h => h.line >= 1)).to.equal(true);
  });

  it("ignores the well-known Hardhat dev key, test paths and clean files", function () {
    const repo = tempRepo();
    fs.writeFileSync(path.join(repo, "config.ts"), `const k = "${HARDHAT_DEFAULT_KEY}";`);
    fs.writeFileSync(path.join(repo, "clean.md"), "# hello\nno secrets here\n");
    const hits = scanSecretShapes(repo, ["config.ts", "clean.md", "test/fixture.ts"]);
    expect(hits).to.deep.equal([]);
  });

  it("reports file and line only", function () {
    const repo = tempRepo();
    fs.writeFileSync(path.join(repo, "x.ts"), ["ok", `const s = "OPENAI_API_KEY=0x${"a".repeat(64)}";`].join("\n"));
    const hits = scanSecretShapes(repo, ["x.ts"]);
    expect(hits).to.deep.equal([{ file: "x.ts", line: 2, kind: "secret assignment" }]);
  });
});
