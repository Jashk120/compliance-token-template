import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const CREATION_FEE = ethers.parseEther("1");
const DECIMALS = 6;
const INITIAL_SUPPLY = 1_000_000n * 10n ** BigInt(DECIMALS);

const KYC_KEY = 2n;
const FREEZE_KEY = 4n;
const SUPPLY_KEY = 16n;
const PAUSE_KEY = 64n;

async function deployBase() {
  const [admin, alice, bob] = await ethers.getSigners();
  const MockHTS = await ethers.getContractFactory("MockHTS");
  const hts = await MockHTS.deploy();
  await hts.waitForDeployment();

  const ComplianceToken = await ethers.getContractFactory("ComplianceToken");
  const compliance = await ComplianceToken.deploy(admin.address, await hts.getAddress(), CREATION_FEE);
  await compliance.waitForDeployment();

  return { admin, alice, bob, hts, compliance };
}

async function deployWithToken() {
  const fixture = await deployBase();
  await fixture.compliance.connect(fixture.admin).createToken("Compliance Token", "CMP", DECIMALS, INITIAL_SUPPLY, {
    value: CREATION_FEE,
  });
  const tokenAddress = await fixture.compliance.tokenAddress();
  return { ...fixture, tokenAddress };
}

describe("ComplianceToken", function () {
  describe("createToken", function () {
    it("creates the token with contract-held KYC, FREEZE, SUPPLY and PAUSE keys", async function () {
      const { compliance, hts, tokenAddress } = await loadFixture(deployWithToken);
      const contractAddress = await compliance.getAddress();

      expect(await compliance.tokenAddress()).to.equal(tokenAddress);
      expect(await hts.treasuryOf(tokenAddress)).to.equal(contractAddress);
      expect(await hts.isPaused(tokenAddress)).to.equal(false);
      for (const keyType of [KYC_KEY, FREEZE_KEY, SUPPLY_KEY, PAUSE_KEY]) {
        expect(await hts.keyController(tokenAddress, keyType)).to.equal(contractAddress);
      }
    });

    it("grants KYC to the treasury after creation", async function () {
      const { compliance, hts, tokenAddress } = await loadFixture(deployWithToken);
      expect(await hts.isKycGranted(tokenAddress, await compliance.getAddress())).to.equal(true);
    });

    it("reverts when supply exceeds int64 max", async function () {
      const { compliance, admin } = await loadFixture(deployBase);
      const tooBig = 9223372036854775807n + 1n;
      await expect(
        compliance.connect(admin).createToken("Big", "BIG", DECIMALS, tooBig, { value: CREATION_FEE }),
      ).to.be.revertedWithCustomError(compliance, "SupplyExceedsInt64");
    });

    it("reverts when the creation fee is underpaid", async function () {
      const { compliance, admin } = await loadFixture(deployBase);
      await expect(
        compliance.connect(admin).createToken("Low", "LOW", DECIMALS, INITIAL_SUPPLY, { value: CREATION_FEE - 1n }),
      ).to.be.revertedWithCustomError(compliance, "InsufficientCreationFee");
    });

    it("forwards the fee to HTS and refunds the excess to the caller", async function () {
      const { compliance, admin, hts } = await loadFixture(deployBase);
      const tx = compliance.connect(admin).createToken("Excess", "EXC", DECIMALS, INITIAL_SUPPLY, {
        value: CREATION_FEE + ethers.parseEther("5"),
      });
      await expect(tx).to.changeEtherBalance(admin, -CREATION_FEE);
      expect(await ethers.provider.getBalance(await hts.getAddress())).to.equal(CREATION_FEE);
      expect(await ethers.provider.getBalance(await compliance.getAddress())).to.equal(0n);
    });

    it("surfaces a precompile failure as a custom error carrying the code", async function () {
      const { compliance, admin, hts } = await loadFixture(deployBase);
      await hts.setForcedCreateResponseCode(194);
      await expect(
        compliance.connect(admin).createToken("Fail", "FLR", DECIMALS, INITIAL_SUPPLY, { value: CREATION_FEE }),
      )
        .to.be.revertedWithCustomError(compliance, "HtsCallFailed")
        .withArgs(194);
    });

    it("cannot create the token twice", async function () {
      const { compliance, admin } = await loadFixture(deployWithToken);
      await expect(
        compliance.connect(admin).createToken("Again", "AGN", DECIMALS, INITIAL_SUPPLY, { value: CREATION_FEE }),
      ).to.be.revertedWithCustomError(compliance, "TokenAlreadyCreated");
    });
  });

  describe("compliance controls", function () {
    it("restricts KYC, freeze and pause to COMPLIANCE_OFFICER_ROLE", async function () {
      const { compliance, alice, tokenAddress } = await loadFixture(deployWithToken);
      void tokenAddress;
      await expect(compliance.connect(alice).grantKyc(alice.address)).to.be.revertedWithCustomError(
        compliance,
        "AccessControlUnauthorizedAccount",
      );
      await expect(compliance.connect(alice).freeze(alice.address)).to.be.revertedWithCustomError(
        compliance,
        "AccessControlUnauthorizedAccount",
      );
      await expect(compliance.connect(alice).pause()).to.be.revertedWithCustomError(
        compliance,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("lets the admin grant the compliance officer role", async function () {
      const { compliance, admin, alice, tokenAddress, hts } = await loadFixture(deployWithToken);
      await compliance.connect(admin).grantRole(await compliance.COMPLIANCE_OFFICER_ROLE(), alice.address);
      await expect(compliance.connect(alice).grantKyc(alice.address))
        .to.emit(compliance, "KycGranted")
        .withArgs(alice.address, alice.address, anyValue);
      expect(await hts.isKycGranted(tokenAddress, alice.address)).to.equal(true);

      await compliance.connect(admin).revokeRole(await compliance.COMPLIANCE_OFFICER_ROLE(), alice.address);
      await expect(compliance.connect(alice).freeze(alice.address)).to.be.revertedWithCustomError(
        compliance,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("emits typed events with account, operator and timestamp", async function () {
      const { compliance, admin, alice, tokenAddress } = await loadFixture(deployWithToken);
      void tokenAddress;
      await expect(compliance.connect(admin).grantKyc(alice.address))
        .to.emit(compliance, "KycGranted")
        .withArgs(alice.address, admin.address, anyValue);
      await expect(compliance.connect(admin).freeze(alice.address))
        .to.emit(compliance, "AccountFrozen")
        .withArgs(alice.address, admin.address, anyValue);
      await expect(compliance.connect(admin).pause())
        .to.emit(compliance, "TokenPaused")
        .withArgs(admin.address, anyValue);
      await expect(compliance.connect(admin).unpause())
        .to.emit(compliance, "TokenUnpaused")
        .withArgs(admin.address, anyValue);
    });

    it("does not mutate compliance state unless called by the keyed contract", async function () {
      const { hts, alice, tokenAddress } = await loadFixture(deployWithToken);
      expect(await hts.connect(alice).grantTokenKyc.staticCall(tokenAddress, alice.address)).to.equal(7n);
    });
  });

  describe("saleTransfer", function () {
    it("is restricted to SALE_OPERATOR_ROLE", async function () {
      const { compliance, alice } = await loadFixture(deployWithToken);
      await expect(compliance.connect(alice).saleTransfer(alice.address, 1n)).to.be.revertedWithCustomError(
        compliance,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("lets an authorised operator move treasury tokens", async function () {
      const { compliance, admin, alice, hts, tokenAddress } = await loadFixture(deployWithToken);
      await compliance.connect(admin).grantRole(await compliance.SALE_OPERATOR_ROLE(), alice.address);
      await hts.connect(alice).associateToken(alice.address, tokenAddress);
      await compliance.connect(admin).grantKyc(alice.address);

      const responseCode = await compliance.connect(alice).saleTransfer.staticCall(alice.address, 10n ** 6n);
      expect(responseCode).to.equal(22n);
      await compliance.connect(alice).saleTransfer(alice.address, 10n ** 6n);
      expect(await hts.balanceOf(tokenAddress, alice.address)).to.equal(10n ** 6n);
    });
  });
});
