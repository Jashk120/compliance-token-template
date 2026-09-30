import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const CREATION_FEE = ethers.parseEther("1");
const DECIMALS = 6;
const INITIAL_SUPPLY = 1_000_000n * 10n ** BigInt(DECIMALS);

const ORACLE_PRICE8 = 100_000_000n; // $1.00 per HBAR, 8 decimals
const TOKEN_PRICE_USD8 = 100_000_000n; // $1.00 per whole token, 8 decimals
const TOKEN_UNIT = 10n ** BigInt(DECIMALS);
const CAP_USD8 = 100_000_000_000n; // $1000.00 per investor, 8 decimals
const MAX_STALENESS = 86_400n; // 24h

// USD (8dp) -> HBAR weibar (18dp) at the fixture oracle price.
const weiFor = (usd8: bigint) => (usd8 * 10n ** 18n) / ORACLE_PRICE8;

async function deploySale() {
  const [admin, buyer, other] = await ethers.getSigners();

  const MockHTS = await ethers.getContractFactory("MockHTS");
  const hts = await MockHTS.deploy();
  await hts.waitForDeployment();

  const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
  const aggregator = await MockChainlinkAggregator.deploy(8, ORACLE_PRICE8);
  await aggregator.waitForDeployment();

  const Adapter = await ethers.getContractFactory("ChainlinkPriceFeedAdapter");
  const adapter = await Adapter.deploy(await aggregator.getAddress());
  await adapter.waitForDeployment();

  const ComplianceToken = await ethers.getContractFactory("ComplianceToken");
  const compliance = await ComplianceToken.deploy(admin.address, await hts.getAddress(), CREATION_FEE);
  await compliance.waitForDeployment();

  const TokenSale = await ethers.getContractFactory("TokenSale");
  const sale = await TokenSale.deploy(
    admin.address,
    await compliance.getAddress(),
    await adapter.getAddress(),
    TOKEN_PRICE_USD8,
    TOKEN_UNIT,
    CAP_USD8,
    MAX_STALENESS,
  );
  await sale.waitForDeployment();

  await compliance.connect(admin).grantRole(await compliance.SALE_OPERATOR_ROLE(), await sale.getAddress());
  await compliance
    .connect(admin)
    .createToken("Compliance Token", "CMP", DECIMALS, INITIAL_SUPPLY, { value: CREATION_FEE });
  const tokenAddress = await compliance.tokenAddress();

  return { admin, buyer, other, hts, aggregator, adapter, compliance, sale, tokenAddress };
}

async function deploySaleReady() {
  const fixture = await deploySale();
  for (const account of [fixture.buyer, fixture.other]) {
    await fixture.hts.connect(account).associateToken(account.address, fixture.tokenAddress);
    await fixture.compliance.connect(fixture.admin).grantKyc(account.address);
  }
  return fixture;
}

describe("TokenSale", function () {
  it("sells tokens after the buyer is associated and KYC-granted", async function () {
    const { sale, buyer, hts, tokenAddress } = await loadFixture(deploySaleReady);
    const value = weiFor(100_000_000n); // $1.00

    expect(await sale.connect(buyer).buy.staticCall({ value })).to.equal(TOKEN_UNIT);
    await expect(sale.connect(buyer).buy({ value }))
      .to.emit(sale, "TokensPurchased")
      .withArgs(buyer.address, TOKEN_UNIT, 100_000_000n, value, 0n);
    expect(await hts.balanceOf(tokenAddress, buyer.address)).to.equal(TOKEN_UNIT);
  });

  it("reverts with KycNotGranted (176) when the buyer has no KYC", async function () {
    const { sale, buyer, hts, tokenAddress } = await loadFixture(deploySale);
    await hts.connect(buyer).associateToken(buyer.address, tokenAddress);
    await expect(sale.connect(buyer).buy({ value: weiFor(100_000_000n) }))
      .to.be.revertedWithCustomError(sale, "KycNotGranted")
      .withArgs(176);
  });

  it("reverts with KycNotGranted (176) after KYC is revoked", async function () {
    const { sale, buyer, compliance } = await loadFixture(deploySaleReady);
    await compliance.revokeKyc(buyer.address);
    await expect(sale.connect(buyer).buy({ value: weiFor(100_000_000n) }))
      .to.be.revertedWithCustomError(sale, "KycNotGranted")
      .withArgs(176);
  });

  it("reverts with Frozen (165) when the buyer is frozen", async function () {
    const { sale, buyer, compliance } = await loadFixture(deploySaleReady);
    await compliance.freeze(buyer.address);
    await expect(sale.connect(buyer).buy({ value: weiFor(100_000_000n) }))
      .to.be.revertedWithCustomError(sale, "Frozen")
      .withArgs(165);
  });

  it("reverts with Paused (265) when the token is paused", async function () {
    const { sale, buyer, compliance } = await loadFixture(deploySaleReady);
    await compliance.pause();
    await expect(sale.connect(buyer).buy({ value: weiFor(100_000_000n) }))
      .to.be.revertedWithCustomError(sale, "Paused")
      .withArgs(265);
  });

  it("reverts with NotAssociated (184) when the buyer is not associated", async function () {
    const { sale, buyer, compliance } = await loadFixture(deploySale);
    await compliance.grantKyc(buyer.address);
    await expect(sale.connect(buyer).buy({ value: weiFor(100_000_000n) }))
      .to.be.revertedWithCustomError(sale, "NotAssociated")
      .withArgs(184);
  });

  describe("oracle", function () {
    it("reverts on a stale answer", async function () {
      const { sale, buyer, aggregator } = await loadFixture(deploySaleReady);
      const now = await time.latest();
      await aggregator.setUpdatedAt(BigInt(now) - MAX_STALENESS - 1n);
      await expect(sale.connect(buyer).buy({ value: weiFor(100_000_000n) })).to.be.revertedWithCustomError(
        sale,
        "StalePrice",
      );
    });

    it("reverts on a zero answer", async function () {
      const { sale, buyer, aggregator } = await loadFixture(deploySaleReady);
      await aggregator.setAnswer(0);
      await expect(sale.connect(buyer).buy({ value: weiFor(100_000_000n) }))
        .to.be.revertedWithCustomError(sale, "InvalidPrice")
        .withArgs(0);
    });

    it("reverts on a negative answer", async function () {
      const { sale, buyer, aggregator } = await loadFixture(deploySaleReady);
      await aggregator.setAnswer(-1);
      await expect(sale.connect(buyer).buy({ value: weiFor(100_000_000n) }))
        .to.be.revertedWithCustomError(sale, "InvalidPrice")
        .withArgs(-1);
    });

    it("reverts on an incomplete round", async function () {
      const { sale, buyer, aggregator } = await loadFixture(deploySaleReady);
      const now = await time.latest();
      await aggregator.setRoundData(2, ORACLE_PRICE8, BigInt(now), BigInt(now), 1);
      await expect(sale.connect(buyer).buy({ value: weiFor(100_000_000n) }))
        .to.be.revertedWithCustomError(sale, "IncompleteRound")
        .withArgs(2, 1);
    });

    it("normalises a non-8-decimal answer", async function () {
      const { sale, buyer, aggregator } = await loadFixture(deploySaleReady);
      await aggregator.setDecimals(6);
      await aggregator.setAnswer(800_000n); // $0.80 at 6 decimals
      const value = 10n ** 18n; // 1 HBAR => $0.80 = 80_000_000 at 8 decimals
      await expect(sale.connect(buyer).buy({ value }))
        .to.emit(sale, "TokensPurchased")
        .withArgs(buyer.address, 800_000n, 80_000_000n, value, 0n);
    });
  });

  it("converts HBAR weibar to 8-decimal USD correctly", async function () {
    const { sale, buyer, aggregator } = await loadFixture(deploySaleReady);
    await aggregator.setAnswer(8_000_000n); // $0.08 per HBAR, 8 decimals
    // 1 HBAR = 1e18 weibar (18 decimals) => 1e18 * 8e6 / 1e18 = 8e6 (8-decimal USD).
    const value = 10n ** 18n;
    await expect(sale.connect(buyer).buy({ value }))
      .to.emit(sale, "TokensPurchased")
      .withArgs(buyer.address, 80_000n, 8_000_000n, value, 0n);
  });

  it("allows spending exactly at the per-investor cap and rejects one USD unit over", async function () {
    const { sale, buyer, other } = await loadFixture(deploySaleReady);
    const atCap = weiFor(CAP_USD8);
    await expect(sale.connect(buyer).buy({ value: atCap })).to.emit(sale, "TokensPurchased");

    const oneOver = weiFor(CAP_USD8 + 1n);
    await expect(sale.connect(other).buy({ value: oneOver }))
      .to.be.revertedWithCustomError(sale, "PerInvestorCapExceeded")
      .withArgs(other.address, CAP_USD8 + 1n, CAP_USD8);
  });

  it("refunds unconvertible dust to the buyer", async function () {
    const { sale, buyer } = await loadFixture(deploySaleReady);
    const dust = 10n ** 10n;
    const value = weiFor(100_000_000n) + dust; // $1.00 + 1 USD unit of dust
    const tx = sale.connect(buyer).buy({ value });
    await expect(tx)
      .to.emit(sale, "TokensPurchased")
      .withArgs(buyer.address, TOKEN_UNIT, 100_000_000n + 1n, value, dust);
    await expect(tx).to.changeEtherBalance(buyer, -weiFor(100_000_000n));
  });

  it("blocks reentrancy through the dust refund", async function () {
    const { sale, buyer, compliance, hts, tokenAddress } = await loadFixture(deploySale);
    const ReentrantBuyer = await ethers.getContractFactory("ReentrantBuyer");
    const attacker = await ReentrantBuyer.deploy(await sale.getAddress());
    await attacker.waitForDeployment();
    const attackerAddress = await attacker.getAddress();

    await hts.connect(buyer).associateToken(attackerAddress, tokenAddress);
    await compliance.grantKyc(attackerAddress);

    await expect(attacker.attack({ value: weiFor(100_000_000n) + 10n ** 10n })).to.be.reverted;
    expect(await hts.balanceOf(tokenAddress, attackerAddress)).to.equal(0n);
  });

  describe("administration", function () {
    it("lets the owner swap the price feed and update staleness, and blocks others", async function () {
      const { sale, admin, buyer } = await loadFixture(deploySaleReady);
      const Adapter = await ethers.getContractFactory("ChainlinkPriceFeedAdapter");
      const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
      const newAggregator = await MockChainlinkAggregator.deploy(8, ORACLE_PRICE8);
      const newAdapter = await Adapter.deploy(await newAggregator.getAddress());

      await expect(sale.connect(admin).setPriceFeed(await newAdapter.getAddress()))
        .to.emit(sale, "PriceFeedUpdated")
        .withArgs(await sale.priceFeed(), await newAdapter.getAddress());
      await expect(sale.connect(buyer).setPriceFeed(await newAdapter.getAddress())).to.be.revertedWithCustomError(
        sale,
        "OwnableUnauthorizedAccount",
      );

      await expect(sale.connect(admin).setMaxStaleness(3_600n)).to.emit(sale, "MaxStalenessUpdated");
      await expect(sale.connect(admin).setMaxStaleness(1n)).to.be.revertedWithCustomError(sale, "StalenessOutOfBounds");
    });
  });
});
